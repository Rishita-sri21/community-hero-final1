import Report from '../models/Report';
import User from '../models/User';
import type { JobDoc } from '../models/Job';
import { POINTS } from '../src/shared/catalog';
import { logAuditEvent } from './audit';
import { publish } from './events';
import { deleteStoredImage, readStoredImage } from './images';
import { PermanentJobError, registerJobHandler } from './jobs';
import { notifyReporter } from './notifications';
import { awardPoints } from './points';
import { CATEGORIES, URGENCIES, iconForCategory, toPublicReport } from './reports';
import { getVision, keywordTriage, type TriageResult } from './vision';

// The background jobs the app runs. Each handler may run more than once for the same job
// (see services/jobs.ts), so each checks what has already happened before acting.

export const JOB_TYPES = {
  VERIFY_FIX: 'verify-fix',
  TRIAGE_REPORT: 'triage-report',
} as const;

// What the person who uploaded a fix photo sees when the check finishes (GET /api/jobs/:id)
export interface FixOutcome {
  success: boolean;
  message: string;
  auditResult?: { success: boolean; confidenceScore: number | null; restorationDetails: string; simulated?: boolean };
  heroPointsAwarded?: number;
  points?: number | null;
}

/** Checks a fix photo and, when it shows the problem fixed, resolves the report and pays out. */
export async function verifyFix(job: JobDoc): Promise<FixOutcome> {
  const { reportId, userId, photoUrl } = job.payload as { reportId: string; userId: string; photoUrl: string };
  const [report, user] = await Promise.all([Report.findById(reportId), User.findById(userId).select('name email avatar points')]);
  if (!report || !user) throw new PermanentJobError('The report or the user no longer exists');

  const isOwnReport = String(report.reporter?.id) === String(user._id);
  const pointsForFix = isOwnReport ? 0 : POINTS.REPORT_RESOLVED;

  if (report.status !== 'open') {
    // A retry of this same job, after it resolved the report but before it recorded the result
    if (String(report.resolution?.jobId) === String(job._id)) {
      return {
        success: true,
        message: 'Resolution verified.',
        heroPointsAwarded: pointsForFix,
        points: user.points,
      };
    }
    await deleteStoredImage(photoUrl);
    return { success: false, message: 'Someone else resolved this issue first.' };
  }

  const checkFix = getVision().checkFix;
  if (!checkFix) {
    await deleteStoredImage(photoUrl);
    return { success: false, message: 'Photo verification is unavailable right now. Please try again later.' };
  }

  const after = await readStoredImage(photoUrl);
  if (!after) throw new PermanentJobError('The uploaded photo is missing');
  // When the reporter uploaded a photo of the problem, compare before and after,
  // which makes unrelated photos much easier to spot
  const before = report.image ? await readStoredImage(report.image) : null;

  // Errors here (rate limits, timeouts, a malformed answer) propagate, and the queue retries
  const check = await checkFix({ title: report.title, description: report.description, before, after });
  const auditResult = {
    success: check.success,
    confidenceScore: check.confidenceScore,
    restorationDetails: check.details,
    ...(check.source === 'simulated' ? { simulated: true } : {}),
  };

  if (!check.success) {
    await deleteStoredImage(photoUrl);
    return {
      success: false,
      message: check.details || 'The photo did not show the problem fixed. Take a clearer photo of the completed repair.',
      auditResult,
    };
  }

  // The status check is part of the update, so if two fixes are checked at once, only one wins
  const resolved = await Report.findOneAndUpdate(
    { _id: report._id, status: 'open' },
    {
      $set: {
        status: 'resolved',
        resolution: {
          by: user._id,
          at: new Date(),
          image: photoUrl,
          details: check.details,
          confidenceScore: check.confidenceScore ?? undefined,
          checkedBy: check.source,
          jobId: job._id,
        },
      },
    },
    { returnDocument: 'after' }
  );
  if (!resolved) {
    await deleteStoredImage(photoUrl);
    return { success: false, message: 'Someone else resolved this issue first.', auditResult };
  }

  logAuditEvent('REPORT_RESOLVED', `Report ${report._id} resolved by ${user.email} (${check.source} check, job ${job._id})`, true, user.email);
  publish({ type: 'report.resolved', id: String(report._id) });
  notifyReporter('resolved', report, user);
  // Known gap: if the process dies between the update above and this line, the retry sees
  // the report already resolved by this job and does not pay again, so the points are lost.
  // Closing it fully needs a transaction (MongoDB replica set) or a points ledger.
  const points = pointsForFix > 0 ? await awardPoints(user._id, pointsForFix) : user.points;

  return {
    success: true,
    message: check.source === 'simulated' ? 'Resolution accepted (simulated verification, demo mode).' : 'Resolution verified!',
    auditResult,
    heroPointsAwarded: pointsForFix,
    points,
  };
}

/** Suggests a category and urgency for a new report and applies them to the fields left to the AI. */
export async function triageReport(job: JobDoc, { lastAttempt }: { lastAttempt: boolean }) {
  const { reportId } = job.payload as { reportId: string };
  const report = await Report.findById(reportId);
  if (!report) throw new PermanentJobError('The report no longer exists');
  if (report.triage?.status === 'done') return { category: report.triage.category, urgency: report.triage.urgency };

  const photo = report.image ? await readStoredImage(report.image) : null;
  let triage: TriageResult;
  try {
    triage = await getVision().triage({ title: report.title, description: report.description, photo });
  } catch (err) {
    // Out of retries: fall back to the keyword classifier rather than leave the report untriaged
    if (!lastAttempt) throw err;
    triage = keywordTriage(report.title, report.description);
    triage.reason = `${triage.reason} (AI triage was unavailable.)`;
  }

  const auto = report.triage?.autoFields ?? [];
  const set: Record<string, unknown> = {
    'triage.status': 'done',
    'triage.category': triage.category,
    'triage.urgency': triage.urgency,
    'triage.reason': triage.reason,
    'triage.source': triage.source,
    'triage.at': new Date(),
  };
  if (auto.includes('category') && (CATEGORIES.includes(triage.category) || triage.category === 'General')) {
    set.category = triage.category;
    set.icon = iconForCategory(triage.category);
  }
  if (auto.includes('urgency') && URGENCIES.includes(triage.urgency)) set.urgency = triage.urgency;

  const updated = await Report.findByIdAndUpdate(report._id, { $set: set }, { returnDocument: 'after' });
  if (updated) publish({ type: 'report.updated', report: toPublicReport(updated) });
  return { category: triage.category, urgency: triage.urgency, source: triage.source };
}

let registered = false;

/** Registers the handlers with the queue. Safe to call more than once. */
export function registerJobHandlers() {
  if (registered) return;
  registered = true;
  registerJobHandler(JOB_TYPES.VERIFY_FIX, verifyFix);
  registerJobHandler(JOB_TYPES.TRIAGE_REPORT, triageReport);
}
