import { Type } from '@google/genai';
import { getGenAI, GEMINI_MODEL, withTimeout } from './ai';
import { timeAiCall } from './metrics';
import { CATEGORIES, URGENCIES } from './reports';

// The two AI judgments the app makes about photos, behind one small interface so the job
// handlers don't care which implementation answers:
// - checkFix: does the AFTER photo show the reported problem fixed?
// - triage: which category and urgency does a new report belong to?
//
// Implementations: Gemini when GEMINI_API_KEY is set. Without it, triage uses a transparent
// keyword classifier (it says which words it matched), and photo checks are unavailable unless
// SIMULATE_AI_VERIFICATION=true, which accepts any photo and labels the result as simulated.

type Photo = { contentType: string; data: Buffer };
type Urgency = 'High' | 'Medium' | 'Low';

export interface FixCheck {
  success: boolean;
  // 0-100 from the model; null when nothing actually looked at the photo (simulated)
  confidenceScore: number | null;
  details: string;
  source: 'gemini' | 'simulated';
}

export interface TriageResult {
  category: string;
  urgency: Urgency;
  reason: string;
  source: 'gemini' | 'keywords';
}

export interface FixInput {
  title: string;
  description: string;
  before: Photo | null;
  after: Photo;
}

export interface TriageInput {
  title: string;
  description: string;
  photo: Photo | null;
}

export interface Vision {
  checkFix: ((input: FixInput) => Promise<FixCheck>) | null;
  triage: (input: TriageInput) => Promise<TriageResult>;
}

const AI_TIMEOUT_MS = 30_000;

const toPart = (img: Photo) => ({ inlineData: { mimeType: img.contentType, data: img.data.toString('base64') } });

async function geminiCheckFix({ title, description, before, after }: FixInput): Promise<FixCheck> {
  const prompt = `You are a municipal inspector. Decide whether the AFTER photo shows the following reported issue resolved, cleaned up or repaired:
Report title: "${title}"
Report description: "${description}"
${before
    ? 'The first image is the BEFORE photo the resident took of the problem. The second image is the AFTER photo. Set success to true only if the AFTER photo plausibly shows the same place as the BEFORE photo, with the problem fixed.'
    : 'The only image is the AFTER photo. Set success to true only if it clearly shows the kind of place described, with the problem fixed.'}
If the AFTER photo is unrelated to the report (a screenshot, a person, an indoor scene, a different kind of place) or the problem is still visible, set success to false and explain why in details.`;

  const response = await timeAiCall('fix-check', () => withTimeout(
    getGenAI()!.models.generateContent({
      model: GEMINI_MODEL,
      contents: { parts: [...(before ? [toPart(before)] : []), toPart(after), { text: prompt }] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            success: { type: Type.BOOLEAN },
            confidenceScore: { type: Type.INTEGER, description: 'Confidence from 0 to 100 in the decision' },
            details: { type: Type.STRING, description: 'One or two sentences on what the photo shows' },
          },
          required: ['success', 'confidenceScore', 'details'],
        },
      },
    }),
    AI_TIMEOUT_MS
  ));
  // A malformed answer throws here, and the job is retried
  const parsed = JSON.parse(response.text || '');
  if (typeof parsed.success !== 'boolean') throw new Error('The model returned no decision');
  const score = Number(parsed.confidenceScore);
  return {
    success: parsed.success,
    confidenceScore: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null,
    details: String(parsed.details || '').slice(0, 500),
    source: 'gemini',
  };
}

async function geminiTriage({ title, description, photo }: TriageInput): Promise<TriageResult> {
  const prompt = `You triage citizen reports of problems in public spaces.
Title: "${title}"
Description: "${description}"
${photo ? 'The image is the photo the resident attached. Base your answer on it as well as the text.' : 'There is no photo.'}
Choose the category from: ${CATEGORIES.join(', ')}.
Choose urgency: High (a danger to people or property, or blocking a road or path), Medium (should be fixed soon), Low (cosmetic).
Give a one-sentence reason that mentions what you saw or read.`;

  const response = await timeAiCall('triage', () => withTimeout(
    getGenAI()!.models.generateContent({
      model: GEMINI_MODEL,
      contents: { parts: [...(photo ? [toPart(photo)] : []), { text: prompt }] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING, enum: CATEGORIES },
            urgency: { type: Type.STRING, enum: URGENCIES },
            reason: { type: Type.STRING },
          },
          required: ['category', 'urgency', 'reason'],
        },
      },
    }),
    AI_TIMEOUT_MS
  ));
  const parsed = JSON.parse(response.text || '');
  // The model's answer is untrusted input too: only accept values from the allowed lists
  if (!CATEGORIES.includes(parsed.category) || !URGENCIES.includes(parsed.urgency)) {
    throw new Error('The model returned a category or urgency outside the allowed lists');
  }
  return { category: parsed.category, urgency: parsed.urgency, reason: String(parsed.reason || '').slice(0, 300), source: 'gemini' };
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Pothole: ['pothole', 'potholes', 'pot hole', 'crack', 'cracked', 'asphalt', 'road surface', 'sinkhole', 'pavement', 'tarmac'],
  Streetlight: ['streetlight', 'street light', 'lamp', 'light out', 'lights out', 'dark street', 'bulb', 'flickering'],
  Graffiti: ['graffiti', 'tag', 'tagged', 'spray paint', 'vandal', 'mural'],
  'Park Maintenance': ['park', 'bench', 'playground', 'tree', 'trees', 'branch', 'fallen branch', 'grass', 'swing', 'trail'],
  'Waste Management': ['trash', 'garbage', 'litter', 'rubbish', 'bin', 'bins', 'dumped', 'dumping', 'waste', 'overflowing'],
  'Water Leakage': ['leak', 'leaks', 'leaking', 'water', 'pipe', 'flood', 'flooding', 'hydrant', 'burst', 'puddle'],
};

const HIGH_URGENCY = ['danger', 'dangerous', 'injury', 'injured', 'hurt', 'hazard', 'exposed wire', 'live wire', 'gas', 'sinkhole', 'flood', 'burst', 'blocking', 'blocked', 'accident', 'collapsed', 'fell', 'unsafe', 'emergency'];
const LOW_URGENCY = ['cosmetic', 'minor', 'small', 'faded', 'slightly', 'a bit', 'eventually'];

/**
 * Picks a category and urgency from words in the report. Deliberately simple and explainable:
 * the reason lists the words that decided it, and "General" is used when nothing matches.
 */
export function keywordTriage(title: string, description: string): TriageResult {
  const text = `${title} ${description}`.toLowerCase();
  // Whole words only, so "tree" doesn't match "street" or "bin" match "cabinet"
  const has = (word: string) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text);
  let best = { category: 'General', hits: [] as string[] };
  for (const [category, words] of Object.entries(CATEGORY_KEYWORDS)) {
    const hits = words.filter(has);
    if (hits.length > best.hits.length) best = { category, hits };
  }
  const high = HIGH_URGENCY.filter(has);
  const low = LOW_URGENCY.filter(has);
  const urgency: Urgency = high.length > 0 ? 'High' : low.length > 0 ? 'Low' : 'Medium';

  const quote = (words: string[]) => words.map((w) => `"${w}"`).join(', ');
  const parts = [best.hits.length > 0 ? `${best.category}: matched ${quote(best.hits)}` : 'No category keywords matched'];
  if (high.length > 0) parts.push(`High urgency: matched ${quote(high)}`);
  else if (low.length > 0) parts.push(`Low urgency: matched ${quote(low)}`);
  return { category: best.category, urgency, reason: `${parts.join('. ')}.`, source: 'keywords' };
}

let override: Partial<Vision> | null = null;

/** Replaces the implementations, for tests. Pass null to go back to the real ones. */
export function setVisionOverride(vision: Partial<Vision> | null) {
  override = vision;
}

export function getVision(): Vision {
  const gemini = getGenAI() !== null;
  const simulated = process.env.SIMULATE_AI_VERIFICATION === 'true';
  const real: Vision = {
    checkFix: gemini
      ? geminiCheckFix
      : simulated
        ? async ({ title }) => ({ success: true, confidenceScore: null, details: `Simulated verification of "${title}" (demo mode).`, source: 'simulated' })
        : null,
    triage: gemini ? geminiTriage : async ({ title, description }) => keywordTriage(title, description),
  };
  return { ...real, ...override };
}
