import mongoose from 'mongoose';

// A unit of background work (services/jobs.ts). The collection itself is the queue:
// workers claim jobs with an atomic findOneAndUpdate, so several workers, in one process
// or many, never run the same job at once.
//
//   pending ──claim──▶ running ──▶ done
//      ▲                  │
//      └──retry (backoff)─┤
//                         └──▶ failed (out of attempts, or a permanent error)
//
// A worker that crashes leaves its job "running" with a lease that runs out; another
// worker then claims it again, so work is never lost, only retried.
const jobSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    status: { type: String, enum: ['pending', 'running', 'done', 'failed'], default: 'pending' },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    result: mongoose.Schema.Types.Mixed,
    // The error from the latest failed attempt
    error: String,
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    // Not claimed before this time: set to now when enqueued, later after a failed attempt
    runAt: { type: Date, default: () => new Date() },
    // Which worker holds the job, and until when. The worker extends the lease while it works.
    lockedBy: String,
    lockedUntil: Date,
    // Who asked for the work, so they (and admins) can read its status
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Id of the HTTP request that queued the job, carried into the job's log lines
    requestId: String,
    startedAt: Date,
    finishedAt: Date,
    // Finished jobs are deleted a week after they finish (TTL index below)
    expireAt: Date,
  },
  { timestamps: true }
);

// Workers look for the earliest pending job that is due
jobSchema.index({ status: 1, runAt: 1 });
// ...and for running jobs whose lease ran out
jobSchema.index({ status: 1, lockedUntil: 1 });
jobSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export type JobDoc = mongoose.InferSchemaType<typeof jobSchema> & { _id: mongoose.Types.ObjectId; createdAt: Date };

export default mongoose.model('Job', jobSchema);
