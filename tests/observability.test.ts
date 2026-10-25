import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../app';
import User from '../models/User';
import Report from '../models/Report';
import Job from '../models/Job';
import { generateToken } from '../utils/jwt';
import { log, withLogContext } from '../services/logger';
import { quantileFromBuckets } from '../services/metrics';
import { drainJobs } from '../services/jobs';
import { settle } from './helpers/jobs';

const MONGO_URI = process.env.TEST_MONGODB_URI;

/** Collects the JSON log lines written while `fn` runs. */
async function captureLogs(fn: () => Promise<unknown> | unknown) {
  const lines: any[] = [];
  const grab = (chunk: any) => {
    for (const line of String(chunk).split('\n')) if (line.startsWith('{')) lines.push(JSON.parse(line));
    return true;
  };
  const out = vi.spyOn(process.stdout, 'write').mockImplementation(grab as any);
  const err = vi.spyOn(process.stderr, 'write').mockImplementation(grab as any);
  const level = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'debug';
  try {
    await fn();
  } finally {
    process.env.LOG_LEVEL = level;
    out.mockRestore();
    err.mockRestore();
  }
  return lines;
}

describe('quantiles from histogram buckets', () => {
  it('interpolates inside the bucket holding the quantile, like histogram_quantile()', () => {
    // 10 requests: 6 under 100 ms, 3 more under 200 ms, 1 more under 1 s
    const buckets = [
      { le: 0.1, count: 6 },
      { le: 0.2, count: 9 },
      { le: 1, count: 10 },
      { le: Infinity, count: 10 },
    ];
    expect(quantileFromBuckets(buckets, 0.5)).toBeCloseTo(0.0833, 3); // 5th of 6 in [0, 0.1]
    expect(quantileFromBuckets(buckets, 0.9)).toBeCloseTo(0.2, 5);
    expect(quantileFromBuckets(buckets, 0.95)).toBeCloseTo(0.6, 5); // halfway through [0.2, 1]
    expect(quantileFromBuckets([{ le: Infinity, count: 0 }], 0.5)).toBeNull();
  });
});

describe('structured logs', () => {
  it('writes one JSON object per line with the context of the work in progress', async () => {
    const lines = await captureLogs(() =>
      withLogContext({ requestId: 'req-12345678' }, async () => {
        await Promise.resolve(); // context survives awaits
        log.info('saved', { reportId: 'r1' });
        log.error('Upload failed:', new Error('disk full'));
      })
    );
    expect(lines[0]).toMatchObject({ level: 'info', msg: 'saved', requestId: 'req-12345678', reportId: 'r1' });
    expect(lines[1]).toMatchObject({ level: 'error', msg: 'Upload failed', requestId: 'req-12345678', err: { message: 'disk full' } });
  });

  it('drops lines below LOG_LEVEL', async () => {
    const lines = await captureLogs(() => {
      process.env.LOG_LEVEL = 'warn';
      log.info('hidden');
      log.warn('shown');
    });
    expect(lines.map((l) => l.msg)).toEqual(['shown']);
  });
});

describe('request ids and metrics', () => {
  afterEach(() => {
    delete process.env.METRICS_TOKEN;
    process.env.NODE_ENV = 'test';
  });

  it('gives every response a request id, keeping a well-formed one sent by the caller', async () => {
    const fresh = await request(app).get('/api/leaderboard-not-a-route');
    expect(fresh.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const kept = await request(app).get('/api/health').set('X-Request-Id', 'trace-abc-123456');
    expect(kept.headers['x-request-id']).toBe('trace-abc-123456');

    const replaced = await request(app).get('/api/health').set('X-Request-Id', 'bad id with spaces');
    expect(replaced.headers['x-request-id']).not.toBe('bad id with spaces');
  });

  it('logs each request once, by route template', async () => {
    const lines = await captureLogs(() => request(app).post('/api/reports/abc/upvote'));
    const entry = lines.find((l) => l.msg === 'request');
    expect(entry).toMatchObject({ method: 'POST', route: '/api/reports/:id/upvote', path: '/api/reports/abc/upvote', status: 401 });
    expect(entry.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof entry.durationMs).toBe('number');
  });

  it('serves Prometheus metrics, labelled by route template rather than raw URL', async () => {
    await request(app).post('/api/reports/111/upvote');
    await request(app).post('/api/reports/222/upvote');

    const res = await request(app).get('/metrics');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toMatch(/http_request_duration_seconds_count\{method="POST",route="\/api\/reports\/:id\/upvote",status="401"\} \d+/);
    expect(res.text).not.toContain('/api/reports/111');
    expect(res.text).toContain('nodejs_eventloop_lag_seconds');
    expect(res.text).toContain('# TYPE jobs_processed_total counter');
  });

  it('protects /metrics with METRICS_TOKEN, and hides it in production without one', async () => {
    process.env.METRICS_TOKEN = 'scrape-secret';
    expect((await request(app).get('/metrics')).status).toBe(404);
    expect((await request(app).get('/metrics').set('Authorization', 'Bearer scrape-secret')).status).toBe(200);

    delete process.env.METRICS_TOKEN;
    process.env.NODE_ENV = 'production';
    expect((await request(app).get('/metrics')).status).toBe(404);
  });
});

describe.skipIf(!MONGO_URI)('tracing work across the job queue (MongoDB)', () => {
  beforeAll(async () => {
    await mongoose.connect(MONGO_URI!, { dbName: `community-hero-obs-test-${process.pid}-${Date.now()}` });
    await Report.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Report.deleteMany({}), Job.deleteMany({})]);
  });

  it("tags a background job's log lines with the id of the request that queued it", async () => {
    const user = await User.create({ name: 'Ana', email: 'ana@example.com', password: 'x' });
    const token = generateToken(String(user._id));

    let requestId = '';
    const requestLines = await captureLogs(async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Deep pothole', description: 'Huge crack', lat: 40.7, lng: -74 });
      requestId = res.headers['x-request-id'];
      await settle();
    });
    expect(requestLines.find((l) => l.msg === 'request' && l.route === '/api/reports')).toMatchObject({ requestId, userId: String(user._id), status: 201 });

    const job = await Job.findOne({ type: 'triage-report' }).lean();
    expect(job!.requestId).toBe(requestId);

    const jobLines = await captureLogs(() => drainJobs());
    expect(jobLines.find((l) => l.msg === 'job attempt finished')).toMatchObject({
      requestId,
      jobId: String(job!._id),
      jobType: 'triage-report',
      outcome: 'done',
      attempt: 1,
    });
  });

  it('shows admins latency per route and per job type', async () => {
    const volunteer = await User.create({ name: 'Bo', email: 'bo@example.com', password: 'x' });
    const admin = await User.create({ name: 'Cy', email: 'cy@example.com', password: 'x', role: 'Organizer' });
    await request(app).get('/api/stories');
    await request(app).get('/api/stories');

    expect((await request(app).get('/api/admin/performance').set('Authorization', `Bearer ${generateToken(String(volunteer._id))}`)).status).toBe(403);
    const res = await request(app).get('/api/admin/performance').set('Authorization', `Bearer ${generateToken(String(admin._id))}`);

    expect(res.status).toBe(200);
    const stories = res.body.routes.find((r: any) => r.route === '/api/stories');
    expect(stories.count).toBeGreaterThanOrEqual(2);
    expect(stories.p95Ms).toBeGreaterThan(0);
    expect(res.body.memoryRssMb).toBeGreaterThan(0);
    expect(Array.isArray(res.body.ai)).toBe(true);
  });
});
