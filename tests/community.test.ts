import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from '../app';
import User from '../models/User';
import Report from '../models/Report';
import AuditLog from '../models/AuditLog';
import Notification from '../models/Notification';
import { generateToken } from '../utils/jwt';

// Squads, personal stats, notifications and admin exports, against a real MongoDB (see points.test.ts).
const MONGO_URI = process.env.TEST_MONGODB_URI;

const PHOTO =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const MANHATTAN = 'Manhattan (New York City, United States)';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function createUser(name: string, extra: Record<string, unknown> = {}) {
  const user = await User.create({ name, email: `${name.toLowerCase()}@example.com`, password: 'secret-hash', district: MANHATTAN, ...extra });
  return { user, token: generateToken(String(user._id)) };
}

async function postReport(token: string, body: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/reports')
    .set(auth(token))
    .send({ title: 'Pothole', description: 'Deep one', category: 'Pothole', lat: 40.78, lng: -73.97, ...body });
  return res.body.report.id as string;
}

describe.skipIf(!MONGO_URI)('community (MongoDB)', () => {
  beforeAll(async () => {
    await mongoose.connect(MONGO_URI!, { dbName: `community-hero-community-test-${process.pid}-${Date.now()}` });
    await Report.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Report.deleteMany({}), AuditLog.deleteMany({}), Notification.deleteMany({})]);
    process.env.SIMULATE_AI_VERIFICATION = 'true';
  });

  it('counts squad members, nearby open reports and fixes by members', async () => {
    const ana = await createUser('Ana', { joinedSquads: ['sq-1'], avatar: 'https://example.com/ana.png' });
    const bo = await createUser('Bo', { joinedSquads: ['sq-1', 'sq-3'] });
    await createUser('Cy');

    const pothole = await postReport(ana.token, { category: 'Pothole' });
    await postReport(ana.token, { category: 'Streetlight' });
    await postReport(ana.token, { category: 'Graffiti' });
    await postReport(ana.token, { category: 'Pothole', lat: 51.5, lng: -0.12 }); // London: not nearby
    await request(app).post('/api/reports/resolve').set(auth(bo.token)).send({ reportId: pothole, image: PHOTO });

    const res = await request(app).get('/api/squads').set(auth(bo.token));

    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.map((s: any) => [s.id, s]));
    expect(byId['sq-1']).toMatchObject({ members: 2, openNearby: 1, fixedByMembers: 1, joined: true });
    expect(byId['sq-1'].memberAvatars).toEqual(['https://example.com/ana.png']);
    expect(byId['sq-2']).toMatchObject({ members: 0, openNearby: 0, fixedByMembers: 0, joined: false });
    expect(byId['sq-3']).toMatchObject({ members: 1, openNearby: 1, joined: true });
  });

  it("counts a user's own activity and rank", async () => {
    const ana = await createUser('Ana');
    const bo = await createUser('Bo');
    const first = await postReport(ana.token);
    await postReport(ana.token);
    await request(app).post(`/api/reports/${first}/upvote`).set(auth(bo.token));
    await request(app).post(`/api/reports/${first}/verify`).set(auth(bo.token));
    const boReport = await postReport(bo.token);
    await request(app).post('/api/reports/resolve').set(auth(ana.token)).send({ reportId: boReport, image: PHOTO });
    // Closing your own report doesn't count as a fix
    await request(app).post('/api/reports/resolve').set(auth(ana.token)).send({ reportId: first, image: PHOTO });

    const res = await request(app).get('/api/users/me/stats').set(auth(ana.token));

    expect(res.body).toMatchObject({
      reportsCreated: 2,
      reportsFixed: 1,
      verificationsGiven: 0,
      upvotesReceived: 1,
      rank: 1,
    });
    const boStats = await request(app).get('/api/users/me/stats').set(auth(bo.token));
    expect(boStats.body).toMatchObject({ verificationsGiven: 1, rank: 2 });
  });

  it('notifies reporters when neighbors upvote, verify or fix their reports', async () => {
    const ana = await createUser('Ana');
    const bo = await createUser('Bo');
    const id = await postReport(ana.token, { title: 'Broken light' });

    await request(app).post(`/api/reports/${id}/upvote`).set(auth(bo.token));
    await request(app).post(`/api/reports/${id}/verify`).set(auth(bo.token));
    await request(app).post('/api/reports/resolve').set(auth(bo.token)).send({ reportId: id, image: PHOTO });
    await new Promise((r) => setTimeout(r, 100)); // notifications are written without blocking the response

    const res = await request(app).get('/api/notifications').set(auth(ana.token));
    expect(res.body.unread).toBe(3);
    expect(res.body.items.map((n: any) => n.type)).toEqual(['resolved', 'verify', 'upvote']);
    expect(res.body.items[0]).toMatchObject({ reportId: id, reportTitle: 'Broken light', actorName: 'Bo', read: false });

    // Bo gets nothing for acting on someone else's report
    expect((await request(app).get('/api/notifications').set(auth(bo.token))).body.items).toHaveLength(0);

    await request(app).post('/api/notifications/read').set(auth(ana.token));
    const after = await request(app).get('/api/notifications').set(auth(ana.token));
    expect(after.body.unread).toBe(0);
    expect(after.body.items.every((n: any) => n.read)).toBe(true);
  });

  it('does not notify reporters about closing their own report', async () => {
    const ana = await createUser('Ana');
    const id = await postReport(ana.token);
    await request(app).post('/api/reports/resolve').set(auth(ana.token)).send({ reportId: id, image: PHOTO });
    await new Promise((r) => setTimeout(r, 100));
    expect(await Notification.countDocuments()).toBe(0);
  });

  it('exports collections as NDJSON to admins only, without passwords', async () => {
    const volunteer = await createUser('Vo');
    const admin = await createUser('Ad', { role: 'Organizer' });
    await postReport(volunteer.token, { title: 'One' });
    await postReport(volunteer.token, { title: 'Two' });

    expect((await request(app).get('/api/admin/export/users').set(auth(volunteer.token))).status).toBe(403);
    expect((await request(app).get('/api/admin/export/secrets').set(auth(admin.token))).status).toBe(404);

    const users = await request(app).get('/api/admin/export/users').set(auth(admin.token)).buffer(true).parse((res, cb) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => cb(null, data));
    });
    expect(users.status).toBe(200);
    expect(users.headers['content-type']).toContain('application/x-ndjson');
    expect(users.headers['content-disposition']).toMatch(/community-hero-users-\d{4}-\d{2}-\d{2}\.ndjson/);
    const lines = (users.body as string).trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((u) => u.name).sort()).toEqual(['Ad', 'Vo']);
    expect(lines.every((u) => u.password === undefined)).toBe(true);

    const reports = await request(app).get('/api/admin/export/reports').set(auth(admin.token)).buffer(true).parse((res, cb) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => cb(null, data));
    });
    expect((reports.body as string).trim().split('\n')).toHaveLength(2);

    await new Promise((r) => setTimeout(r, 100));
    const status = await request(app).get('/api/admin/db/status').set(auth(admin.token));
    expect(status.body.lastExport).toMatchObject({ by: 'ad@example.com', message: 'Exported 2 reports documents' });
  });

  it('reports real database measurements to admins', async () => {
    const admin = await createUser('Ad', { role: 'Civil Servant' });
    const res = await request(app).get('/api/admin/db/status').set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.engine).toBe('MongoDB');
    expect(res.body.version).toMatch(/^\d+\.\d+/);
    expect(res.body.pingMs).toBeGreaterThanOrEqual(0);
    expect(res.body.collections.find((c: any) => c.name === 'users').documents).toBe(1);
    expect(res.body.lastExport).toBeNull();
  });
});
