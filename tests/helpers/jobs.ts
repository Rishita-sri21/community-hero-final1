import request from 'supertest';
import type { Express } from 'express';
import { drainJobs } from '../../services/jobs';

/**
 * Submits a fix photo, runs the queued photo check, and returns the check's outcome.
 * `status` is the submit response's status (202 when the check was queued); `body` is the
 * job's result when it ran, otherwise the submit response's body.
 */
export async function resolveAndWait(app: Express, token: string, reportId: string, image: string) {
  const auth = { Authorization: `Bearer ${token}` };
  const submitted = await request(app).post('/api/reports/resolve').set(auth).send({ reportId, image });
  if (submitted.status !== 202) return { status: submitted.status, body: submitted.body, job: null };
  await drainJobs();
  const job = (await request(app).get(`/api/jobs/${submitted.body.job.id}`).set(auth)).body;
  return { status: submitted.status, body: job.result, job };
}

/** Waits for fire-and-forget work (like queueing a job after a response) to land. */
export const settle = (ms = 100) => new Promise((r) => setTimeout(r, ms));
