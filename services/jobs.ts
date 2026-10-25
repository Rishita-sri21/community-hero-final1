import os from 'os';
import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import Job, { JobDoc } from '../models/Job';

// A durable background job queue stored in MongoDB (models/Job.ts).
//
// Why a queue: AI photo checks take seconds and sometimes fail (rate limits, timeouts).
// Doing them inside the HTTP request ties up the request, loses the work if the server
// restarts, and turns a passing hiccup into an error for the user. Here a request only
// records what needs doing and returns; workers do the work, retry failures with backoff,
// and pick up jobs a crashed worker left behind.
//
// Guarantees: at-least-once execution. A job can run more than once (its worker's lease
// ran out while it was still working, or it crashed after the work but before recording it),
// so handlers must be safe to repeat.

export const queueSettings = {
  // How long a claimed job stays reserved; the worker renews it every third of this
  leaseMs: 60_000,
  // How often an idle worker looks for due jobs (it also wakes at once when a job is enqueued here)
  pollMs: 1_000,
  concurrency: 2,
  // Retry delays grow 2 s, 4 s, 8 s ... up to 5 minutes, with jitter
  baseBackoffMs: 2_000,
  maxBackoffMs: 5 * 60_000,
  // Finished jobs are kept this long for the admin console, then deleted by a TTL index
  keepFinishedMs: 7 * 24 * 60 * 60_000,
};

/** Throw this from a handler when retrying can't help (e.g. the report was deleted). */
export class PermanentJobError extends Error {}

export interface JobContext {
  // True on the job's last allowed attempt, so a handler can fall back instead of failing
  lastAttempt: boolean;
}

export type JobHandler = (job: JobDoc, context: JobContext) => Promise<unknown>;

const handlers = new Map<string, JobHandler>();
const wake = new EventEmitter();

export function registerJobHandler(type: string, handler: JobHandler) {
  handlers.set(type, handler);
}

export async function enqueue(
  type: string,
  payload: Record<string, unknown>,
  options: { createdBy?: unknown; maxAttempts?: number } = {}
) {
  if (!handlers.has(type)) throw new Error(`No handler registered for job type "${type}"`);
  const job = await Job.create({ type, payload, createdBy: options.createdBy as any, maxAttempts: options.maxAttempts ?? 3 });
  wake.emit('enqueued');
  return job;
}

/**
 * Delay before attempt `attempt + 1`: exponential, capped, with "equal jitter" (half fixed,
 * half random) so jobs that failed together, e.g. during an outage, don't all retry together.
 */
export function backoffMs(attempt: number, random = Math.random) {
  const ceiling = Math.min(queueSettings.maxBackoffMs, queueSettings.baseBackoffMs * 2 ** (attempt - 1));
  return Math.round(ceiling / 2 + (random() * ceiling) / 2);
}

/**
 * Atomically reserves the next due job for `workerId`: the earliest pending job whose time
 * has come, or a running job whose lease ran out (its worker died). Returns null when
 * nothing is due. Two workers can never claim the same job: MongoDB applies the filter and
 * the update as one operation on the document.
 */
export async function claimNext(workerId: string, now = new Date()) {
  return Job.findOneAndUpdate(
    {
      $or: [
        { status: 'pending', runAt: { $lte: now } },
        { status: 'running', lockedUntil: { $lt: now } },
      ],
    },
    {
      $set: { status: 'running', lockedBy: workerId, lockedUntil: new Date(now.getTime() + queueSettings.leaseMs), startedAt: now },
      $inc: { attempts: 1 },
    },
    { sort: { runAt: 1 }, returnDocument: 'after' }
  ).lean<JobDoc>();
}

/**
 * Runs a claimed job and records the outcome. Every write is fenced on (worker, attempt):
 * if this worker's lease ran out and another worker re-claimed the job, attempts has
 * changed, so this worker's late result is ignored instead of overwriting the newer run.
 */
export async function runJob(job: JobDoc, workerId: string) {
  const fence = { _id: job._id, lockedBy: workerId, attempts: job.attempts };
  const finish = (fields: Record<string, unknown>) => {
    const finishedAt = new Date();
    return Job.updateOne(fence, {
      $set: { ...fields, finishedAt, expireAt: new Date(finishedAt.getTime() + queueSettings.keepFinishedMs) },
      $unset: { lockedBy: 1, lockedUntil: 1 },
    });
  };

  // Re-claimed after its worker died on the last attempt: don't run it again
  if (job.attempts > job.maxAttempts) {
    await finish({ status: 'failed', error: job.error || 'The worker stopped responding on the last attempt' });
    return 'failed' as const;
  }
  const handler = handlers.get(job.type);
  if (!handler) {
    await finish({ status: 'failed', error: `No handler registered for job type "${job.type}"` });
    return 'failed' as const;
  }

  // Keep the lease while the handler works, so a slow but healthy job isn't taken over
  const heartbeat = setInterval(() => {
    Job.updateOne(fence, { $set: { lockedUntil: new Date(Date.now() + queueSettings.leaseMs) } }).catch(() => {});
  }, queueSettings.leaseMs / 3);
  heartbeat.unref();

  try {
    const result = await handler(job, { lastAttempt: job.attempts >= job.maxAttempts });
    await finish({ status: 'done', result: result ?? null, error: null });
    return 'done' as const;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof PermanentJobError || job.attempts >= job.maxAttempts) {
      console.error(`Job ${job._id} (${job.type}) failed for good after ${job.attempts} attempt(s): ${message}`);
      await finish({ status: 'failed', error: message });
      return 'failed' as const;
    }
    const delay = backoffMs(job.attempts);
    console.warn(`Job ${job._id} (${job.type}) attempt ${job.attempts} failed, retrying in ${Math.round(delay / 1000)} s: ${message}`);
    await Job.updateOne(fence, {
      $set: { status: 'pending', error: message, runAt: new Date(Date.now() + delay) },
      $unset: { lockedBy: 1, lockedUntil: 1 },
    });
    return 'retrying' as const;
  } finally {
    clearInterval(heartbeat);
  }
}

/** Runs due jobs one at a time until none are left. For tests and scripts. */
export async function drainJobs(workerId = 'drain') {
  let ran = 0;
  for (let job = await claimNext(workerId); job; job = await claimNext(workerId)) {
    await runJob(job, workerId);
    ran++;
  }
  return ran;
}

/**
 * Starts a worker in this process: up to `concurrency` jobs at a time. Several processes
 * (or servers) can each run one against the same database. stop() stops claiming new jobs
 * and waits for the ones in progress, for a clean shutdown.
 */
export function startWorker() {
  const id = `${os.hostname()}:${process.pid}:${randomBytes(3).toString('hex')}`;
  const inFlight = new Set<Promise<unknown>>();
  let stopping = false;
  let filling = false;
  let fillAgain = false;

  // Claims jobs until the worker is full or nothing is due. Never runs twice at once.
  const fill = async () => {
    if (filling) {
      fillAgain = true;
      return;
    }
    filling = true;
    try {
      do {
        fillAgain = false;
        while (!stopping && inFlight.size < queueSettings.concurrency) {
          const job = await claimNext(id);
          if (!job) break;
          const run: Promise<unknown> = runJob(job, id)
            .catch((err) => console.error(`Worker ${id} could not record job ${job._id}:`, err))
            .finally(() => {
              inFlight.delete(run);
              void fill();
            });
          inFlight.add(run);
        }
      } while (fillAgain && !stopping);
    } catch (err) {
      // e.g. the database is briefly unreachable; the next poll tries again
      console.error(`Worker ${id} could not claim jobs:`, err instanceof Error ? err.message : err);
    } finally {
      filling = false;
    }
  };

  const onWake = () => void fill();
  wake.on('enqueued', onWake);
  const poll = setInterval(onWake, queueSettings.pollMs);
  poll.unref();
  void fill();

  return {
    id,
    get active() {
      return inFlight.size;
    },
    async stop() {
      stopping = true;
      clearInterval(poll);
      wake.off('enqueued', onWake);
      await Promise.allSettled([...inFlight]);
    },
  };
}

/** What a job's creator (or an admin) may see about it. */
export function toPublicJob(job: JobDoc) {
  return {
    id: String(job._id),
    type: job.type,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    result: job.status === 'done' ? job.result : undefined,
    error: job.status === 'done' ? undefined : job.error || undefined,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    // When a pending job will next be tried (later than now while it waits out a backoff)
    runAt: job.status === 'pending' ? job.runAt : undefined,
  };
}

/** Moves a failed job back to pending with a fresh set of attempts. */
export async function retryFailedJob(id: unknown) {
  const job = await Job.findOneAndUpdate(
    { _id: id, status: 'failed' },
    { $set: { status: 'pending', attempts: 0, runAt: new Date() }, $unset: { finishedAt: 1, expireAt: 1 } },
    { returnDocument: 'after' }
  ).lean<JobDoc>();
  if (job) wake.emit('enqueued');
  return job;
}

/** Queue health for the admin console: backlog, throughput, timings and recent failures. */
export async function queueStats(now = new Date()) {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);
  const [counts, oldestDue, timings, recentFailures] = await Promise.all([
    Job.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Job.findOne({ status: 'pending', runAt: { $lte: now } }).sort({ runAt: 1 }).select('runAt').lean<JobDoc>(),
    Job.aggregate([
      { $match: { status: 'done', finishedAt: { $gte: dayAgo } } },
      {
        $group: {
          _id: '$type',
          completed: { $sum: 1 },
          // Wait: enqueued until the last attempt started. Run: that attempt's duration.
          avgWaitMs: { $avg: { $subtract: ['$startedAt', '$createdAt'] } },
          avgRunMs: { $avg: { $subtract: ['$finishedAt', '$startedAt'] } },
          retried: { $sum: { $cond: [{ $gt: ['$attempts', 1] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Job.find({ status: 'failed' }).sort({ finishedAt: -1 }).limit(10).lean<JobDoc[]>(),
  ]);

  const byStatus = Object.fromEntries(counts.map((c) => [c._id, c.n]));
  return {
    pending: byStatus.pending ?? 0,
    running: byStatus.running ?? 0,
    done: byStatus.done ?? 0,
    failed: byStatus.failed ?? 0,
    oldestDueSeconds: oldestDue ? Math.round((now.getTime() - oldestDue.runAt.getTime()) / 1000) : null,
    last24h: timings.map((t) => ({
      type: t._id,
      completed: t.completed,
      retried: t.retried,
      avgWaitMs: Math.round(t.avgWaitMs),
      avgRunMs: Math.round(t.avgRunMs),
    })),
    recentFailures: recentFailures.map((j) => ({
      id: String(j._id),
      type: j.type,
      attempts: j.attempts,
      error: j.error,
      finishedAt: j.finishedAt,
    })),
  };
}
