import Report from '../models/Report';
import { keywordTriage } from './vision';

// Finds open reports that probably describe the same problem as a new one, so neighbors
// upvote the existing report instead of filing it again.
//
// A pair is scored on three signals, each between 0 and 1:
// - distance: 1 at the same spot, falling linearly to 0 at DUPLICATE_RADIUS_M (farther = not a duplicate)
// - text: how many words (and, for typos and spacing, character trigrams) the two reports share
// - category: 1 when both are in the same specific category
// The weighted sum decides: above SUGGEST_THRESHOLD the reporter is shown the match before
// posting; above LIKELY_THRESHOLD the new report is flagged as a likely duplicate.

export const DUPLICATE_RADIUS_M = 150;
export const SUGGEST_THRESHOLD = 0.45;
export const LIKELY_THRESHOLD = 0.65;
const WEIGHTS = { text: 0.45, distance: 0.35, category: 0.2 };

const STOPWORDS = new Set(
  ('the and for are but not you all any can had her was one our out has have this that with from there their they them ' +
    'been were will would could should into onto over under near next very just also some more most much many than then ' +
    'its it\'s on in at of to a an is be by or as it we my me so if no up do does did here what when where which who why how ' +
    'about again still keep keeps getting really since today yesterday morning night week weeks days day street road corner')
    .split(' ')
);

/** Lowercase words with stopwords removed and a light plural/verb-ending stem ("potholes" → "pothole"). */
export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]+/g) ?? ([] as string[]))
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    .map((w) => w.replace(/(ing|ed|(?<!s)s)$/, (end) => (w.length - end.length >= 4 ? '' : end)));
}

function jaccard<T>(a: Set<T>, b: Set<T>) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return shared / (a.size + b.size - shared);
}

function trigrams(words: string[]) {
  const grams = new Set<string>();
  for (const w of words) {
    const padded = ` ${w} `;
    for (let i = 0; i < padded.length - 2; i++) grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

/** 0 (nothing in common) to 1 (same words). Trigrams catch "pot hole" vs "pothole" and typos. */
export function textSimilarity(a: string, b: string) {
  const ta = tokens(a);
  const tb = tokens(b);
  return 0.6 * jaccard(new Set(ta), new Set(tb)) + 0.4 * jaccard(trigrams(ta), trigrams(tb));
}

export interface DuplicateInput {
  title: string;
  description: string;
  // 'auto' or unknown when the reporter left it to triage
  category?: string;
}

export interface DuplicateMatch {
  id: string;
  title: string;
  category: string;
  distanceMeters: number;
  // 0 to 1
  score: number;
  reasons: string[];
  upvotes: number;
}

/** The category we'd expect for a report, using keyword rules when the reporter didn't pick one. */
function effectiveCategory(input: DuplicateInput) {
  if (input.category && input.category !== 'auto' && input.category !== 'General') return input.category;
  const guess = keywordTriage(input.title, input.description).category;
  return guess === 'General' ? null : guess;
}

export function duplicateScore(
  input: DuplicateInput,
  existing: { title: string; description: string; category?: string | null },
  distanceMeters: number
) {
  if (distanceMeters > DUPLICATE_RADIUS_M) return { score: 0, reasons: [] as string[] };

  // Titles carry the most signal, so they count twice
  const text = textSimilarity(
    `${input.title} ${input.title} ${input.description}`,
    `${existing.title} ${existing.title} ${existing.description}`
  );
  const distance = 1 - distanceMeters / DUPLICATE_RADIUS_M;
  const ours = effectiveCategory(input);
  const category = ours !== null && ours === existing.category ? 1 : 0;
  const score = WEIGHTS.text * text + WEIGHTS.distance * distance + WEIGHTS.category * category;

  const reasons = [`${Math.round(distanceMeters)} m away`];
  if (category) reasons.push(`both ${existing.category}`);
  const shared = [...new Set(tokens(input.title + ' ' + input.description))].filter((w) =>
    tokens(existing.title + ' ' + existing.description).includes(w)
  );
  if (shared.length > 0) reasons.push(`shared words: ${shared.slice(0, 4).join(', ')}`);
  return { score: Math.round(score * 100) / 100, reasons };
}

/**
 * Open reports near `at` that look like the same problem, best match first (at most 3).
 * One $geoNear query on the 2dsphere index, then scoring in memory.
 */
export async function findSimilarReports(
  input: DuplicateInput & { lat: number; lng: number },
  options: { excludeId?: string } = {}
): Promise<DuplicateMatch[]> {
  const nearby = await Report.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [input.lng, input.lat] },
        distanceField: 'distanceMeters',
        maxDistance: DUPLICATE_RADIUS_M,
        query: { status: 'open' },
        spherical: true,
      },
    },
    { $limit: 50 },
    { $project: { title: 1, description: 1, category: 1, upvotes: 1, distanceMeters: 1 } },
  ]);

  return nearby
    .filter((r) => String(r._id) !== options.excludeId)
    .map((r) => {
      const { score, reasons } = duplicateScore(input, r, r.distanceMeters);
      return {
        id: String(r._id),
        title: r.title,
        category: r.category,
        distanceMeters: Math.round(r.distanceMeters),
        score,
        reasons,
        upvotes: r.upvotes ?? 0,
      };
    })
    .filter((m) => m.score >= SUGGEST_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/**
 * Closes `duplicateId` as a duplicate of `targetId` and carries its support over: everyone who
 * upvoted or verified the duplicate, and its reporter, now count as upvoters of the target
 * (except the target's own reporter, who can't upvote their own report). Returns null if either
 * report isn't open any more. Points already earned are left as they are.
 */
export async function mergeDuplicate(duplicateId: string, targetId: string) {
  const duplicate = await Report.findOneAndUpdate(
    { _id: duplicateId, status: 'open' },
    { $set: { status: 'duplicate', duplicateOf: targetId } },
    { returnDocument: 'after' }
  );
  if (!duplicate) return null;

  const target = await Report.findOne({ _id: targetId, status: 'open' }).select('reporter').lean();
  if (!target) {
    // The target closed in the meantime: undo, so the duplicate isn't lost
    await Report.updateOne({ _id: duplicateId }, { $set: { status: 'open' }, $unset: { duplicateOf: 1 } });
    return null;
  }

  const targetReporter = target.reporter?.id ? String(target.reporter.id) : null;
  const supporters = [...duplicate.upvotedBy, ...(duplicate.reporter?.id ? [duplicate.reporter.id] : [])].filter(
    (id) => String(id) !== targetReporter
  );
  const verifiers = duplicate.verifiedBy.filter((id) => String(id) !== targetReporter);

  // An update pipeline adds the supporters and raises the count by however many were new,
  // in one atomic write (the count can't be recomputed from the list: seeded reports have
  // upvotes without upvoters)
  const merged = await Report.findOneAndUpdate(
    { _id: targetId },
    [
      { $set: { mergedUpvoters: { $setUnion: ['$upvotedBy', supporters] }, verifiedBy: { $setUnion: ['$verifiedBy', verifiers] } } },
      {
        $set: {
          upvotes: { $add: ['$upvotes', { $subtract: [{ $size: '$mergedUpvoters' }, { $size: '$upvotedBy' }] }] },
          upvotedBy: '$mergedUpvoters',
          verified: { $or: ['$verified', { $gt: [{ $size: '$verifiedBy' }, 0] }] },
        },
      },
      { $unset: 'mergedUpvoters' },
    ],
    { returnDocument: 'after', updatePipeline: true }
  );
  return { duplicate, target: merged! };
}
