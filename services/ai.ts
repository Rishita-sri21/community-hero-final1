import { GoogleGenAI, Type } from '@google/genai';
import { log } from './logger';
import { timeAiCall } from './metrics';
import type { Mission } from './missions';

// Gemini is optional. Every feature that uses it either has a plain fallback (mission briefings)
// or says clearly that it is unavailable (photo verification, the assistant). Nothing is made up.

export const GEMINI_MODEL = 'gemini-3.5-flash';

let client: GoogleGenAI | null = null;

/** The Gemini client, or null when GEMINI_API_KEY isn't set. */
export function getGenAI(): GoogleGenAI | null {
  if (!client) {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (key && key !== 'MY_GEMINI_API_KEY') {
      try {
        client = new GoogleGenAI({ apiKey: key });
      } catch (err) {
        log.error('Error initializing GoogleGenAI:', err);
      }
    }
  }
  return client;
}

/** Rejects if `promise` takes longer than `ms`, so a slow model can't hold a request open. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

export interface MissionBriefing {
  title: string;
  briefing: string;
  briefingSource: 'gemini' | 'template';
}

/** A title and summary built only from the mission's own numbers. */
export function templateBriefing(mission: Mission, district?: string): MissionBriefing {
  const counts = new Map<string, number>();
  for (const stop of mission.stops) counts.set(stop.category, (counts.get(stop.category) ?? 0) + 1);
  const topCategory = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const area = district?.split(' (')[0];
  const high = mission.stops.filter((s) => s.urgency === 'High').length;
  const n = mission.stops.length;

  return {
    title: `${topCategory} sweep${area ? ` in ${area}` : ''}`,
    briefing:
      `Visit ${n} open report${n === 1 ? '' : 's'}${high ? `, ${high} of them high urgency,` : ''} ` +
      `on a ${mission.totalKm.toFixed(1)} km walk (about ${mission.estimatedMinutes} minutes). ` +
      `Start with "${mission.stops[0].title}".`,
    briefingSource: 'template',
  };
}

/** Asks Gemini to phrase the briefing; falls back to the template if it's unavailable or slow. */
export async function writeMissionBriefing(mission: Mission, district?: string): Promise<MissionBriefing> {
  const fallback = templateBriefing(mission, district);
  const ai = getGenAI();
  if (!ai) return fallback;

  const facts = mission.stops.map((s, i) =>
    `${i + 1}. "${s.title}" (${s.category}, ${s.urgency} urgency; ${s.reasons.join(', ')})`
  ).join('\n');
  const prompt = `Write a short title (at most 6 words) and a 2-sentence briefing for a volunteer walking route.
Use only the facts below. Do not invent numbers, places or outcomes.
Neighborhood: ${district || 'unknown'}
Walk: ${mission.totalKm.toFixed(1)} km, about ${mission.estimatedMinutes} minutes, ${mission.stops.length} stops in this order:
${facts}`;

  try {
    const response = await timeAiCall('mission-briefing', () => withTimeout(
      ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: { title: { type: Type.STRING }, briefing: { type: Type.STRING } },
            required: ['title', 'briefing'],
          },
        },
      }),
      8000
    ));
    const { title, briefing } = JSON.parse(response.text || '{}');
    if (typeof title !== 'string' || typeof briefing !== 'string' || !title || !briefing) return fallback;
    return { title: title.slice(0, 80), briefing: briefing.slice(0, 400), briefingSource: 'gemini' };
  } catch (err) {
    log.warn('Mission briefing fell back to the template', err);
    return fallback;
  }
}
