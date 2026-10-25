import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from '../app';
import User from '../models/User';
import Report from '../models/Report';
import Job from '../models/Job';
import { generateToken } from '../utils/jwt';
import { POINTS } from '../src/shared/catalog';
import {
  PermanentJobError,
  backoffMs,
  claimNext,
  drainJobs,
  enqueue,
  queueSettings,
  registerJobHandler,
  retryFailedJob,
  runJob,
  startWorker,
} from '../services/jobs';
import { keywordTriage, setVisionOverride } from '../services/vision';
import { findImage } from '../services/images';
import { resolveAndWait, settle } from './helpers/jobs';

const MONGO_URI = process.env.TEST_MONGODB_URI;
const PHOTO =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('retry backoff', () => {
  it('doubles up to the cap, with up to half of each delay random', () => {
    const low = () => 0;
    const high = () => 0.999999;
    expect(backoffMs(1, low)).toBe(1000);
    expect(backoffMs(1, high)).toBe(2000);
    expect(backoffMs(3, low)).toBe(4000);
    expect(backoffMs(3, high)).toBe(8000);
    expect(backoffMs(30, high)).toBe(queueSettings.maxBackoffMs);
  });
});

describe('keyword triage', () => {
  it('picks the category with the most matching words and explains why', () => {
    const t = keywordTriage('Huge pothole', 'Deep crack in the asphalt on 5th street');
    expect(t).toMatchObject({ category: 'Pothole', urgency: 'Medium', source: 'keywords' });
    expect(t.reason).toContain('"pothole"');
  });

  it('raises urgency for danger words and lowers it for cosmetic ones', () => {
    expect(keywordTriage('Burst pipe', 'Water flooding the sidewalk').urgency).toBe('High');
    expect(keywordTriage('Graffiti', 'Small tag on a wall, cosmetic').urgency).toBe('Low');
  });

  it('matches whole words only and says when nothing matched', () => {
    // "street" contains "tree", "cabinet" contains "bin"
    const t = keywordTriage('Something on my street', 'Near the cabinet shop');
    expect(t.category).toBe('General');
    expect(t.reason).toMatch(/No category keywords matched/);
  });
});

describe.skipIf(!MONGO_URI)('job queue (MongoDB)', () => {
  const calls: string[] = [];
  let failuresLeft = 0;

  beforeAll(async () => {
    await mongoose.connect(MONGO_URI!, { dbName: `community-hero-jobs-test-${process.pid}-${Date.now()}` });
    await Promise.all([Job.syncIndexes(), Report.syncIndexes()]);
    registerJobHandler('test-echo', async (job) => {
      calls.push(String(job.payload.name));
      if (failuresLeft > 0) {
        failuresLeft--;
        throw new Error('temporary outage');
      }
      return { echoed: job.payload.name };
    });
    registerJobHandler('test-permanent', async () => {
      throw new PermanentJobError('nothing to retry');
    });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const savedBackoff = queueSettings.baseBackoffMs;
  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Report.deleteMany({}), Job.deleteMany({})]);
    calls.length = 0;
    failuresLeft = 0;
    // Retries become due immediately, so drainJobs runs them without waiting
    queueSettings.baseBackoffMs = 0;
    delete process.env.SIMULATE_AI_VERIFICATION;
  });

  afterEach(() => {
    queueSettings.baseBackoffMs = savedBackoff;
    setVisionOverride(null);
  });

  async function createUser(name: string, extra: Record<string, unknown> = {}) {
    const user = await User.create({ name, email: `${name.toLowerCase()}@example.com`, password: 'x', ...extra });
    return { user, token: generateToken(String(user._id)) };
  }

  describe('queue mechanics', () => {
    it('runs a job and records its result', async () => {
      const job = await enqueue('test-echo', { name: 'one' });
      expect(job.status).toBe('pending');

      expect(await drainJobs()).toBe(1);

      const done = await Job.findById(job._id).lean();
      expect(done).toMatchObject({ status: 'done', attempts: 1, result: { echoed: 'one' } });
      expect(done!.finishedAt).toBeInstanceOf(Date);
      // Finished jobs are cleaned up by the TTL index a week later
      expect(done!.expireAt!.getTime() - done!.finishedAt!.getTime()).toBe(queueSettings.keepFinishedMs);
      expect(done!.lockedBy).toBeUndefined();
    });

    it('retries failures and succeeds when the problem passes', async () => {
      failuresLeft = 2;
      const job = await enqueue('test-echo', { name: 'flaky' });

      await drainJobs();

      expect(calls).toEqual(['flaky', 'flaky', 'flaky']);
      expect(await Job.findById(job._id).lean()).toMatchObject({ status: 'done', attempts: 3 });
    });

    it('waits out the backoff before retrying', async () => {
      queueSettings.baseBackoffMs = 60_000;
      failuresLeft = 1;
      const job = await enqueue('test-echo', { name: 'later' });

      await drainJobs();

      const waiting = await Job.findById(job._id).lean();
      expect(waiting).toMatchObject({ status: 'pending', attempts: 1, error: 'temporary outage' });
      expect(waiting!.runAt.getTime()).toBeGreaterThan(Date.now() + 25_000);
      expect(calls).toHaveLength(1);
    });

    it('gives up after the last attempt, and an admin retry starts over', async () => {
      failuresLeft = 99;
      const job = await enqueue('test-echo', { name: 'down' }, { maxAttempts: 2 });

      await drainJobs();
      expect(await Job.findById(job._id).lean()).toMatchObject({ status: 'failed', attempts: 2, error: 'temporary outage' });

      failuresLeft = 0;
      await retryFailedJob(job._id);
      await drainJobs();
      expect(await Job.findById(job._id).lean()).toMatchObject({ status: 'done', attempts: 1 });
    });

    it('does not retry permanent errors', async () => {
      const job = await enqueue('test-permanent', {});
      await drainJobs();
      expect(await Job.findById(job._id).lean()).toMatchObject({ status: 'failed', attempts: 1, error: 'nothing to retry' });
    });

    it('never hands the same job to two workers', async () => {
      await Job.insertMany(Array.from({ length: 20 }, (_, i) => ({ type: 'test-echo', payload: { name: `j${i}` } })));

      const claims = await Promise.all(Array.from({ length: 40 }, (_, i) => claimNext(`worker-${i}`)));

      const claimed = claims.filter(Boolean).map((j) => String(j!._id));
      expect(claimed).toHaveLength(20);
      expect(new Set(claimed).size).toBe(20);
    });

    it('takes over a job whose worker died, and ignores the dead worker if it comes back', async () => {
      const job = await enqueue('test-echo', { name: 'orphan' });
      const first = await claimNext('worker-a');
      expect(first).toMatchObject({ lockedBy: 'worker-a', attempts: 1 });

      // worker-a stops renewing its lease; once the lease has run out, worker-b claims the job
      const later = new Date(Date.now() + queueSettings.leaseMs + 1000);
      const second = await claimNext('worker-b', later);
      expect(second).toMatchObject({ lockedBy: 'worker-b', attempts: 2 });

      // worker-a finishing late must not overwrite worker-b's claim
      await runJob(first!, 'worker-a');
      expect(await Job.findById(job._id).lean()).toMatchObject({ status: 'running', lockedBy: 'worker-b' });

      await runJob(second!, 'worker-b');
      expect(await Job.findById(job._id).lean()).toMatchObject({ status: 'done', attempts: 2 });
    });

    it('runs jobs in a background worker as soon as they are queued', async () => {
      const worker = startWorker();
      try {
        const jobs = await Promise.all(['a', 'b', 'c'].map((name) => enqueue('test-echo', { name })));
        for (let i = 0; i < 50 && (await Job.countDocuments({ status: 'done' })) < 3; i++) await settle(20);
        expect(await Job.countDocuments({ _id: { $in: jobs.map((j) => j._id) }, status: 'done' })).toBe(3);
      } finally {
        await worker.stop();
      }
      expect(calls.sort()).toEqual(['a', 'b', 'c']);
    });
  });

  describe('photo checks', () => {
    async function openReport(reporterToken: string) {
      const res = await request(app)
        .post('/api/reports')
        .set(auth(reporterToken))
        .send({ title: 'Broken bench', description: 'Snapped slats', category: 'Park Maintenance', urgency: 'Low', lat: 40.7, lng: -74, image: PHOTO });
      return res.body.report.id as string;
    }

    it('queues the check and shows its progress only to the person who sent it', async () => {
      process.env.SIMULATE_AI_VERIFICATION = 'true';
      const reporter = await createUser('Ana');
      const fixer = await createUser('Bo');
      const id = await openReport(reporter.token);

      const submitted = await request(app).post('/api/reports/resolve').set(auth(fixer.token)).send({ reportId: id, image: PHOTO });
      expect(submitted.status).toBe(202);
      expect(submitted.body.job).toMatchObject({ type: 'verify-fix', status: 'pending', attempts: 0 });
      // Nothing is decided until the job runs
      expect((await Report.findById(id))!.status).toBe('open');

      const jobUrl = `/api/jobs/${submitted.body.job.id}`;
      expect((await request(app).get(jobUrl).set(auth(reporter.token))).status).toBe(404);
      expect((await request(app).get(jobUrl).set(auth(fixer.token))).body.status).toBe('pending');

      await drainJobs();
      const job = (await request(app).get(jobUrl).set(auth(fixer.token))).body;
      expect(job).toMatchObject({ status: 'done', result: { success: true, heroPointsAwarded: POINTS.REPORT_RESOLVED } });
      const report = await Report.findById(id);
      expect(report!.status).toBe('resolved');
      expect(report!.resolution).toMatchObject({ checkedBy: 'simulated' });
      expect(String(report!.resolution!.jobId)).toBe(job.id);
    });

    it('keeps the report open and deletes the photo when the check says no', async () => {
      setVisionOverride({
        checkFix: async () => ({ success: false, confidenceScore: 91, details: 'The photo shows a kitchen, not a bench.', source: 'gemini' }),
      });
      const reporter = await createUser('Cy');
      const fixer = await createUser('Di');
      const id = await openReport(reporter.token);

      const res = await resolveAndWait(app, fixer.token, id, PHOTO);

      expect(res.body).toMatchObject({ success: false, message: 'The photo shows a kitchen, not a bench.', auditResult: { confidenceScore: 91 } });
      expect((await Report.findById(id))!.status).toBe('open');
      expect((await User.findById(fixer.user._id))!.points).toBe(0);
      const job = await Job.findById(res.job.id).lean();
      const photoId = String(job!.payload.photoUrl).split('/').pop()!;
      expect(await findImage(photoId)).toBeNull();
    });

    it('retries when the AI call fails, then resolves', async () => {
      let calls = 0;
      setVisionOverride({
        checkFix: async () => {
          calls++;
          if (calls === 1) throw new Error('429 Too Many Requests');
          return { success: true, confidenceScore: 88, details: 'Bench repaired with new slats.', source: 'gemini' };
        },
      });
      const reporter = await createUser('Ed');
      const fixer = await createUser('Fa');
      const id = await openReport(reporter.token);

      const res = await resolveAndWait(app, fixer.token, id, PHOTO);

      expect(res.job).toMatchObject({ status: 'done', attempts: 2 });
      expect(res.body).toMatchObject({ success: true, auditResult: { confidenceScore: 88 }, points: POINTS.REPORT_RESOLVED });
      expect((await Report.findById(id))!.resolution).toMatchObject({ checkedBy: 'gemini', confidenceScore: 88 });
    });

    it('pays only one of two people who fix the same report at the same time', async () => {
      process.env.SIMULATE_AI_VERIFICATION = 'true';
      const reporter = await createUser('Gi');
      const first = await createUser('Ha');
      const second = await createUser('Io');
      const id = await openReport(reporter.token);

      const [a, b] = await Promise.all([
        request(app).post('/api/reports/resolve').set(auth(first.token)).send({ reportId: id, image: PHOTO }),
        request(app).post('/api/reports/resolve').set(auth(second.token)).send({ reportId: id, image: PHOTO }),
      ]);
      expect([a.status, b.status]).toEqual([202, 202]);
      await drainJobs();

      const results = (await Job.find({ type: 'verify-fix' }).lean()).map((j: any) => j.result.success).sort();
      expect(results).toEqual([false, true]);
      const points = [(await User.findById(first.user._id))!.points, (await User.findById(second.user._id))!.points].sort();
      expect(points).toEqual([0, POINTS.REPORT_RESOLVED]);
    });
  });

  describe('triage', () => {
    it('fills in the category and urgency the reporter left to the AI', async () => {
      const { token } = await createUser('Jo');
      const res = await request(app)
        .post('/api/reports')
        .set(auth(token))
        .send({ title: 'Huge pothole', description: 'Dangerous, a cyclist fell this morning', category: 'auto', lat: 40.7, lng: -74 });
      expect(res.status).toBe(201);
      expect(res.body.report).toMatchObject({ category: 'General', urgency: 'Medium', triage: { status: 'pending', autoFields: ['category', 'urgency'] } });

      await settle();
      await drainJobs();

      const report = (await request(app).get('/api/reports')).body[0];
      expect(report).toMatchObject({ category: 'Pothole', urgency: 'High', icon: 'warning' });
      expect(report.triage).toMatchObject({ status: 'done', source: 'keywords', category: 'Pothole', urgency: 'High' });
      expect(report.triage.reason).toContain('"pothole"');
    });

    it("records a suggestion but keeps the reporter's own choices", async () => {
      const { token } = await createUser('Ka');
      await request(app)
        .post('/api/reports')
        .set(auth(token))
        .send({ title: 'Burst pipe', description: 'Water flooding the road', category: 'Graffiti', urgency: 'Low', lat: 40.7, lng: -74 });

      await settle();
      await drainJobs();

      const report = await Report.findOne().lean();
      expect(report).toMatchObject({ category: 'Graffiti', urgency: 'Low' });
      expect(report!.triage).toMatchObject({ status: 'done', category: 'Water Leakage', urgency: 'High', autoFields: [] });
    });

    it('uses the AI answer when there is one, and falls back to keywords when the AI keeps failing', async () => {
      const { token } = await createUser('Li');
      setVisionOverride({ triage: async () => ({ category: 'Streetlight', urgency: 'High', reason: 'The photo shows a dark lamp post.', source: 'gemini' }) });
      await request(app).post('/api/reports').set(auth(token)).send({ title: 'Problem', description: 'See photo', lat: 40.7, lng: -74, image: PHOTO });
      await settle();
      await drainJobs();
      expect(await Report.findOne({ title: 'Problem' }).lean()).toMatchObject({ category: 'Streetlight', triage: { source: 'gemini' } });

      setVisionOverride({ triage: async () => { throw new Error('503 Service Unavailable'); } });
      await request(app).post('/api/reports').set(auth(token)).send({ title: 'Overflowing bins', description: 'Trash everywhere', lat: 40.7, lng: -74 });
      await settle();
      await drainJobs();
      const report = await Report.findOne({ title: 'Overflowing bins' }).lean();
      expect(report).toMatchObject({ category: 'Waste Management', triage: { status: 'done', source: 'keywords' } });
      expect(report!.triage!.reason).toContain('AI triage was unavailable');
      expect(await Job.findOne({ 'payload.reportId': String(report!._id) }).lean()).toMatchObject({ status: 'done', attempts: 3 });
    });
  });

  describe('admin', () => {
    it('shows queue health and retries failed jobs, for admins only', async () => {
      const volunteer = await createUser('Mo');
      const admin = await createUser('Ny', { role: 'Organizer' });
      // The first job claimed fails on its only attempt; the second succeeds
      const failed = await enqueue('test-echo', { name: 'x' }, { maxAttempts: 1 });
      await enqueue('test-echo', { name: 'y' });
      failuresLeft = 1;
      await drainJobs();

      expect((await request(app).get('/api/admin/jobs').set(auth(volunteer.token))).status).toBe(403);
      const stats = (await request(app).get('/api/admin/jobs').set(auth(admin.token))).body;
      expect(stats).toMatchObject({ pending: 0, running: 0, done: 1, failed: 1, oldestDueSeconds: null });
      expect(stats.last24h).toEqual([expect.objectContaining({ type: 'test-echo', completed: 1, retried: 0 })]);
      expect(stats.recentFailures).toEqual([expect.objectContaining({ id: String(failed._id), error: 'temporary outage' })]);

      expect((await request(app).post(`/api/admin/jobs/${failed._id}/retry`).set(auth(volunteer.token))).status).toBe(403);
      const retried = await request(app).post(`/api/admin/jobs/${failed._id}/retry`).set(auth(admin.token));
      expect(retried.body).toMatchObject({ status: 'pending', attempts: 0 });
      expect((await request(app).post(`/api/admin/jobs/${failed._id}/retry`).set(auth(admin.token))).status).toBe(404);
    });
  });
});
