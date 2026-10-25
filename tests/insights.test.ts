import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from '../app';
import User from '../models/User';
import Report from '../models/Report';
import { generateToken } from '../utils/jwt';

// Mission planning, analytics, stories and the assistant, against a real MongoDB (see points.test.ts).
const MONGO_URI = process.env.TEST_MONGODB_URI;

const TINY_JPEG_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const HOUR = 3_600_000;

async function createUser(name: string, extra: Record<string, unknown> = {}) {
  const user = await User.create({ name, email: `${name.toLowerCase()}@example.com`, password: 'x', ...extra });
  return { user, token: generateToken(String(user._id)) };
}

// Inserts a report directly, so tests can control its age and status
function insertReport(fields: Record<string, any>) {
  const { lat = 40.7, lng = -74, ...rest } = fields;
  return Report.create({
    reporter: { name: 'Neighbor' },
    title: 'Issue',
    description: 'Details',
    category: 'Pothole',
    urgency: 'Medium',
    district: 'Test',
    location: { type: 'Point', coordinates: [lng, lat] },
    ...rest,
  });
}

describe.skipIf(!MONGO_URI)('insights (MongoDB)', () => {
  beforeAll(async () => {
    await mongoose.connect(MONGO_URI!, { dbName: `community-hero-insights-test-${process.pid}-${Date.now()}` });
    await Report.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Report.deleteMany({})]);
    delete process.env.SIMULATE_AI_VERIFICATION;
  });

  describe('missions', () => {
    it('requires sign-in and a start location', async () => {
      expect((await request(app).get('/api/missions/plan?lat=40.7&lng=-74')).status).toBe(401);
      const { token } = await createUser('Ana');
      expect((await request(app).get('/api/missions/plan').set(auth(token))).status).toBe(400);
    });

    it('plans a route through open reports nearby, ignoring resolved and distant ones', async () => {
      const { token } = await createUser('Bo', { district: 'Manhattan (New York City, United States)' });
      await insertReport({ title: 'Deep pothole', urgency: 'High', lat: 40.7010, lng: -74.0000 });
      await insertReport({ title: 'Faded crossing', lat: 40.7030, lng: -74.0010 });
      await insertReport({ title: 'Already fixed', lat: 40.7020, lng: -74.0005, status: 'resolved' });
      await insertReport({ title: 'Other city', urgency: 'High', lat: 51.5, lng: -0.12 });

      const res = await request(app).get('/api/missions/plan?lat=40.7&lng=-74').set(auth(token));

      expect(res.status).toBe(200);
      const { mission } = res.body;
      expect(mission.stops.map((s: any) => s.title)).toEqual(['Deep pothole', 'Faded crossing']);
      expect(mission.consideredReports).toBe(2);
      expect(mission.start).toEqual({ lat: 40.7, lng: -74 });
      expect(mission.totalKm).toBeGreaterThan(0.3);
      // No Gemini key in tests: the briefing comes from the plan itself
      expect(mission.briefingSource).toBe('template');
      expect(mission.title).toBe('Pothole sweep in Manhattan');
    });

    it('returns no mission when nothing is open nearby', async () => {
      const { token } = await createUser('Cy');
      const res = await request(app).get('/api/missions/plan?lat=40.7&lng=-74').set(auth(token));
      expect(res.body).toEqual({ mission: null, searchRadiusKm: 20 });
    });
  });

  describe('analytics', () => {
    it('counts reports in range and measures time to fix', async () => {
      const now = Date.now();
      await insertReport({ category: 'Graffiti', urgency: 'High' });
      await insertReport({ category: 'Graffiti', urgency: 'Low' });
      // Fixed after 2 h and after 10 h: median 6 h
      await insertReport({
        status: 'resolved',
        createdAt: new Date(now - 12 * HOUR),
        resolution: { at: new Date(now - 10 * HOUR) },
      });
      await insertReport({
        status: 'resolved',
        category: 'Streetlight',
        createdAt: new Date(now - 11 * HOUR),
        resolution: { at: new Date(now - HOUR) },
      });
      await insertReport({ lat: 51.5, lng: -0.12 }); // out of range

      const res = await request(app).get('/api/analytics?lat=40.7&lng=-74');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ open: 2, resolved: 2, resolutionRate: 0.5, medianHoursToResolve: 6, averageHoursToResolve: 6 });
      expect(res.body.byCategory).toContainEqual({ category: 'Graffiti', open: 2, resolved: 0 });
      expect(res.body.byCategory).toContainEqual({ category: 'Streetlight', open: 0, resolved: 1 });
      expect(res.body.byUrgency).toEqual([
        { urgency: 'High', open: 1 },
        { urgency: 'Medium', open: 0 },
        { urgency: 'Low', open: 1 },
      ]);
      expect(res.body.last7Days).toHaveLength(7);
      const today = res.body.last7Days[6];
      expect(today.reported).toBeGreaterThanOrEqual(2);
      expect(res.body.last7Days.reduce((n: number, d: any) => n + d.resolved, 0)).toBe(2);
    });

    it('reports no rate or median for an empty area', async () => {
      const res = await request(app).get('/api/analytics?lat=0&lng=0');
      expect(res.body).toMatchObject({ open: 0, resolved: 0, resolutionRate: null, medianHoursToResolve: null });
    });
  });

  describe('stories', () => {
    it('shows resolved reports with their fix photo and who fixed them', async () => {
      process.env.SIMULATE_AI_VERIFICATION = 'true';
      const reporter = await createUser('Di');
      const fixer = await createUser('Ed');
      const created = await request(app)
        .post('/api/reports')
        .set(auth(reporter.token))
        .send({ title: 'Broken bench', description: 'Snapped slats', lat: 40.7, lng: -74, image: TINY_JPEG_URL });
      const reportId = created.body.report.id;
      await request(app).post('/api/reports/resolve').set(auth(fixer.token)).send({ reportId, image: TINY_JPEG_URL });

      const res = await request(app).get('/api/stories');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        id: reportId,
        title: 'Broken bench',
        reportedBy: { name: 'Di' },
        resolvedBy: { name: 'Ed' },
      });
      expect(res.body[0].beforeImage).toMatch(/^\/api\/images\//);
      expect(res.body[0].afterImage).toMatch(/^\/api\/images\//);
      expect(res.body[0].afterImage).not.toBe(res.body[0].beforeImage);
    });
  });

  describe('assistant', () => {
    it('says it is unavailable instead of inventing answers when no AI is configured', async () => {
      const { token } = await createUser('Fa');
      const res = await request(app)
        .post('/api/assistant/chat')
        .set(auth(token))
        .send({ messages: [{ role: 'user', text: 'What is urgent?' }] });
      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/Gemini/);
    });

    it('requires sign-in and a valid conversation', async () => {
      expect((await request(app).post('/api/assistant/chat').send({ messages: [] })).status).toBe(401);
      const { token } = await createUser('Gi');
      const res = await request(app).post('/api/assistant/chat').set(auth(token)).send({ messages: 'hi' });
      expect(res.status).toBe(400);
    });
  });
});
