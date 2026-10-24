import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from '../app';
import User from '../models/User';
import Report from '../models/Report';
import { generateToken } from '../utils/jwt';
import { MAX_REWARDED_REPORTS_PER_DAY, POINTS } from '../src/shared/catalog';

// These tests need a real MongoDB because the points rules rely on atomic MongoDB updates.
// Report storage, photos and location search are covered in reports.test.ts.
// CI provides one; locally, set TEST_MONGODB_URI (e.g. mongodb://127.0.0.1:27017) to run them.
const MONGO_URI = process.env.TEST_MONGODB_URI;

async function createUser(name: string, points = 0) {
  const user = await User.create({
    name,
    email: `${name.toLowerCase()}@example.com`,
    password: 'not-used-in-these-tests',
    points,
  });
  return { user, token: generateToken(String(user._id)) };
}

async function pointsOf(user: { _id: unknown }) {
  return (await User.findById(user._id))!.points;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function createReport(token: string, extra: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/reports')
    .set(auth(token))
    .send({ title: 'Broken streetlight', description: 'Dark corner at night.', lat: 40.72, lng: -74.0, ...extra });
}

describe.skipIf(!MONGO_URI)('points rules (MongoDB)', () => {
  beforeAll(async () => {
    await mongoose.connect(MONGO_URI!, { dbName: `community-hero-test-${process.pid}-${Date.now()}` });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Report.deleteMany({})]);
    delete process.env.SIMULATE_AI_VERIFICATION;
  });

  describe('creating reports', () => {
    it('awards points once, keeps the location and hides the reporter email', async () => {
      const { user, token } = await createUser('Ana');

      const res = await createReport(token, { lat: 40.73, lng: -73.99 });

      expect(res.status).toBe(201);
      expect(res.body.points).toBe(POINTS.REPORT_CREATED);
      expect(await pointsOf(user)).toBe(POINTS.REPORT_CREATED);
      expect(res.body.report).toMatchObject({ lat: 40.73, lng: -73.99, isMine: true, reporter: { name: 'Ana' } });
      expect(res.body.report.reporter.email).toBeUndefined();

      const list = await request(app).get('/api/reports');
      expect(JSON.stringify(list.body)).not.toContain('ana@example.com');
    });

    it(`stops awarding points after ${MAX_REWARDED_REPORTS_PER_DAY} reports in a day`, async () => {
      const { user, token } = await createUser('Bo');

      for (let i = 0; i < MAX_REWARDED_REPORTS_PER_DAY; i++) {
        expect((await createReport(token)).body.points).not.toBeNull();
      }
      const extra = await createReport(token);

      expect(extra.status).toBe(201);
      expect(extra.body.points).toBeNull();
      expect(await pointsOf(user)).toBe(POINTS.REPORT_CREATED * MAX_REWARDED_REPORTS_PER_DAY);
    });
  });

  describe('verifying and upvoting', () => {
    it('lets each neighbor verify once and blocks verifying your own report', async () => {
      const reporter = await createUser('Cy');
      const neighbor = await createUser('Di');
      const reportId = (await createReport(reporter.token)).body.report.id;

      const own = await request(app).post(`/api/reports/${reportId}/verify`).set(auth(reporter.token));
      expect(own.status).toBe(403);

      const first = await request(app).post(`/api/reports/${reportId}/verify`).set(auth(neighbor.token));
      expect(first.status).toBe(200);
      expect(first.body.report).toMatchObject({ verified: true, hasVerified: true });
      expect(first.body.points).toBe(POINTS.REPORT_VERIFIED);

      const again = await request(app).post(`/api/reports/${reportId}/verify`).set(auth(neighbor.token));
      expect(again.status).toBe(409);
      expect(await pointsOf(neighbor.user)).toBe(POINTS.REPORT_VERIFIED);
    });

    it('lets each neighbor upvote once and blocks upvoting your own report', async () => {
      const reporter = await createUser('Ed');
      const neighbor = await createUser('Fi');
      const reportId = (await createReport(reporter.token)).body.report.id;

      expect((await request(app).post(`/api/reports/${reportId}/upvote`).set(auth(reporter.token))).status).toBe(403);

      const first = await request(app).post(`/api/reports/${reportId}/upvote`).set(auth(neighbor.token));
      expect(first.status).toBe(200);
      expect(first.body.report).toMatchObject({ upvotes: 1, hasUpvoted: true });

      expect((await request(app).post(`/api/reports/${reportId}/upvote`).set(auth(neighbor.token))).status).toBe(409);
      expect(await pointsOf(neighbor.user)).toBe(POINTS.REPORT_UPVOTED);
    });
  });

  describe('resolving', () => {
    const photo = 'data:image/jpeg;base64,AAAA';

    it('refuses instead of faking success when AI verification is unavailable', async () => {
      const reporter = await createUser('Gu');
      const fixer = await createUser('Ha');
      const reportId = (await createReport(reporter.token)).body.report.id;

      const res = await request(app).post('/api/reports/resolve').set(auth(fixer.token)).send({ reportId, image: photo });

      expect(res.status).toBe(503);
      expect(await pointsOf(fixer.user)).toBe(0);
      const list = await request(app).get('/api/reports');
      expect(list.body.some((r: any) => r.id === reportId)).toBe(true);
    });

    it('in demo mode, resolves once and never your own report', async () => {
      process.env.SIMULATE_AI_VERIFICATION = 'true';
      const reporter = await createUser('Io');
      const fixer = await createUser('Jo');
      const reportId = (await createReport(reporter.token)).body.report.id;

      const own = await request(app).post('/api/reports/resolve').set(auth(reporter.token)).send({ reportId, image: photo });
      expect(own.status).toBe(403);

      const res = await request(app).post('/api/reports/resolve').set(auth(fixer.token)).send({ reportId, image: photo });
      expect(res.status).toBe(200);
      expect(res.body.userSession.points).toBe(POINTS.REPORT_RESOLVED);

      const again = await request(app).post('/api/reports/resolve').set(auth(fixer.token)).send({ reportId, image: photo });
      expect(again.status).toBe(404);
      expect(await pointsOf(fixer.user)).toBe(POINTS.REPORT_RESOLVED);
    });
  });

  describe('green actions', () => {
    it('awards each action once per day and rejects unknown actions', async () => {
      const { user, token } = await createUser('Ka');

      const first = await request(app).post('/api/actions/green').set(auth(token)).send({ actionId: 'food-bank' });
      expect(first.status).toBe(200);
      expect(first.body).toEqual({ points: 25, awarded: 25 });

      const again = await request(app).post('/api/actions/green').set(auth(token)).send({ actionId: 'food-bank' });
      expect(again.status).toBe(429);

      const other = await request(app).post('/api/actions/green').set(auth(token)).send({ actionId: 'plant-seedling' });
      expect(other.body.points).toBe(40);

      const unknown = await request(app).post('/api/actions/green').set(auth(token)).send({ actionId: 'free-money' });
      expect(unknown.status).toBe(400);
      expect(await pointsOf(user)).toBe(40);
    });
  });

  describe('rewards', () => {
    it('charges the catalogue price and refuses when the balance is too low', async () => {
      const { user, token } = await createUser('Li', 200);

      const ok = await request(app).post('/api/rewards/redeem').set(auth(token)).send({ rewardId: 'rwd-1' });
      expect(ok.status).toBe(200);
      expect(ok.body.points).toBe(50);
      expect(ok.body.code).toMatch(/^MUNI-[0-9A-F]{8}$/);

      const tooExpensive = await request(app).post('/api/rewards/redeem').set(auth(token)).send({ rewardId: 'rwd-2' });
      expect(tooExpensive.status).toBe(400);
      expect(await pointsOf(user)).toBe(50);
    });

    it('never lets simultaneous redemptions overspend the balance', async () => {
      const { user, token } = await createUser('Mo', 200);

      // Five requests at once for a 150-point reward with a 200-point balance: exactly one may succeed
      const results = await Promise.all(
        Array.from({ length: 5 }, () => request(app).post('/api/rewards/redeem').set(auth(token)).send({ rewardId: 'rwd-1' }))
      );

      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(await pointsOf(user)).toBe(50);
    });
  });

  describe('squads', () => {
    it('pays the join bonus only the first time', async () => {
      const { user, token } = await createUser('Ny');

      const join = await request(app).post('/api/users/join-squad').set(auth(token)).send({ squadId: 'sq-1' });
      expect(join.body).toMatchObject({ joinedSquads: ['sq-1'], points: 30, awarded: 30 });

      const leave = await request(app).post('/api/users/leave-squad').set(auth(token)).send({ squadId: 'sq-1' });
      expect(leave.body.joinedSquads).toEqual([]);

      const rejoin = await request(app).post('/api/users/join-squad').set(auth(token)).send({ squadId: 'sq-1' });
      expect(rejoin.body).toMatchObject({ joinedSquads: ['sq-1'], points: 30, awarded: 0 });

      const unknown = await request(app).post('/api/users/join-squad').set(auth(token)).send({ squadId: 'sq-999' });
      expect(unknown.status).toBe(400);
      expect(await pointsOf(user)).toBe(30);
    });
  });
});
