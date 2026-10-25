import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from '../app';
import User from '../models/User';
import Report from '../models/Report';
import AuditLog from '../models/AuditLog';
import { generateToken } from '../utils/jwt';
import { seedDemoReports } from '../services/reports';
import type { AddressInfo } from 'net';
import { openStream } from './helpers/stream';
import Job from '../models/Job';
import { drainJobs } from '../services/jobs';
import { resolveAndWait } from './helpers/jobs';

// Report storage, photos and location search, against a real MongoDB (see points.test.ts).
const MONGO_URI = process.env.TEST_MONGODB_URI;

// A real 1x1 JPEG, so the stored bytes can be compared after a round trip
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64'
);
const TINY_JPEG_URL = `data:image/jpeg;base64,${TINY_JPEG.toString('base64')}`;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function createUser(name: string, extra: Record<string, unknown> = {}) {
  const user = await User.create({ name, email: `${name.toLowerCase()}@example.com`, password: 'x', ...extra });
  return { user, token: generateToken(String(user._id)) };
}

function postReport(token: string, body: Record<string, unknown>) {
  return request(app)
    .post('/api/reports')
    .set(auth(token))
    .send({ title: 'Overflowing bin', description: 'Bags piled on the sidewalk.', ...body });
}

describe.skipIf(!MONGO_URI)('reports (MongoDB)', () => {
  beforeAll(async () => {
    await mongoose.connect(MONGO_URI!, { dbName: `community-hero-reports-test-${process.pid}-${Date.now()}` });
    await Report.syncIndexes(); // $geoNear needs the 2dsphere index to exist
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Report.deleteMany({}), AuditLog.deleteMany({}), Job.deleteMany({})]);
    delete process.env.SIMULATE_AI_VERIFICATION;
  });

  it('requires a map location for new reports', async () => {
    const { token } = await createUser('Ana');
    const res = await postReport(token, {});
    expect(res.status).toBe(400);
    expect(await Report.countDocuments()).toBe(0);
  });

  it('lists the nearest reports first, with their distance', async () => {
    const { token } = await createUser('Bo');
    await postReport(token, { title: 'Brooklyn', lat: 40.6782, lng: -73.9442 });
    await postReport(token, { title: 'London', lat: 51.4975, lng: -0.1357 });
    await postReport(token, { title: 'Manhattan', lat: 40.7831, lng: -73.9712 });

    const fromLondon = await request(app).get('/api/reports?lat=51.5&lng=-0.12');
    expect(fromLondon.body.map((r: any) => r.title)).toEqual(['London', 'Manhattan', 'Brooklyn']);
    expect(fromLondon.body[0].distanceKm).toBeLessThan(2);
    expect(fromLondon.body[1].distanceKm).toBeGreaterThan(5000);

    // Without a location, newest first
    const newest = await request(app).get('/api/reports');
    expect(newest.body.map((r: any) => r.title)).toEqual(['Manhattan', 'London', 'Brooklyn']);
    expect(newest.body[0].distanceKm).toBeUndefined();
  });

  it('stores a report photo in the database and serves it back', async () => {
    const { token } = await createUser('Cy');
    const res = await postReport(token, { lat: 40.7, lng: -74, image: TINY_JPEG_URL });

    expect(res.status).toBe(201);
    expect(res.body.report.image).toMatch(/^\/api\/images\/[0-9a-f]{24}$/);

    const image = await request(app).get(res.body.report.image).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/jpeg');
    expect(Buffer.compare(image.body, TINY_JPEG)).toBe(0);

    expect((await request(app).get('/api/images/000000000000000000000000')).status).toBe(404);
    expect((await request(app).get('/api/images/not-an-id')).status).toBe(404);
  });

  it('rejects photos that are not images or are too large', async () => {
    const { token } = await createUser('Di');
    const html = await postReport(token, { lat: 40.7, lng: -74, image: 'data:text/html;base64,PHNjcmlwdD4=' });
    expect(html.status).toBe(400);

    const huge = `data:image/jpeg;base64,${Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64')}`;
    const tooBig = await postReport(token, { lat: 40.7, lng: -74, image: huge });
    expect(tooBig.status).toBe(400);
    expect(await Report.countDocuments()).toBe(0);
  });

  it('counts only one of several simultaneous verifications by the same person', async () => {
    const reporter = await createUser('Ed');
    const neighbor = await createUser('Fi');
    const id = (await postReport(reporter.token, { lat: 40.7, lng: -74 })).body.report.id;

    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(app).post(`/api/reports/${id}/verify`).set(auth(neighbor.token)))
    );

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await Report.findById(id))!.verifiedBy).toHaveLength(1);
    expect((await User.findById(neighbor.user._id))!.points).toBe(15);
  });

  it('returns 404 for unknown or malformed report ids', async () => {
    const { token } = await createUser('Gu');
    expect((await request(app).post('/api/reports/not-an-id/upvote').set(auth(token))).status).toBe(404);
    expect((await request(app).post('/api/reports/000000000000000000000000/verify').set(auth(token))).status).toBe(404);
  });

  it('keeps resolved reports with the fix photo, and hides them from the open list', async () => {
    process.env.SIMULATE_AI_VERIFICATION = 'true';
    const reporter = await createUser('Ha');
    const fixer = await createUser('Io');
    const id = (await postReport(reporter.token, { lat: 40.7, lng: -74 })).body.report.id;

    const res = await resolveAndWait(app, fixer.token, id, TINY_JPEG_URL);
    expect(res.body.success).toBe(true);

    const stored = await Report.findById(id);
    expect(stored!.status).toBe('resolved');
    expect(String(stored!.resolution!.by)).toBe(String(fixer.user._id));
    expect(stored!.resolution!.image).toMatch(/^\/api\/images\//);

    const list = await request(app).get('/api/reports');
    expect(list.body).toHaveLength(0);
  });

  it('rejects a fix photo that is not an image before doing anything else', async () => {
    process.env.SIMULATE_AI_VERIFICATION = 'true';
    const reporter = await createUser('Jo');
    const fixer = await createUser('Ka');
    const id = (await postReport(reporter.token, { lat: 40.7, lng: -74 })).body.report.id;

    const res = await request(app).post('/api/reports/resolve').set(auth(fixer.token)).send({ reportId: id, image: 'not a photo' });
    expect(res.status).toBe(400);
    expect((await Report.findById(id))!.status).toBe('open');
  });

  it('records audit events in MongoDB and shows them to admins only', async () => {
    const reporter = await createUser('Li');
    const admin = await createUser('Mo', { role: 'Organizer' });
    const id = (await postReport(reporter.token, { lat: 40.7, lng: -74 })).body.report.id;
    await request(app).post(`/api/reports/${id}/verify`).set(auth(admin.token));

    // Audit writes don't block the response, so give them a moment
    await new Promise((r) => setTimeout(r, 200));

    expect((await request(app).get('/api/admin/audit-logs').set(auth(reporter.token))).status).toBe(403);
    const logs = await request(app).get('/api/admin/audit-logs').set(auth(admin.token));
    expect(logs.status).toBe(200);
    expect(logs.body.map((l: any) => l.event)).toEqual(expect.arrayContaining(['REPORT_CREATED', 'REPORT_VERIFIED']));
    expect(logs.body[0]).toHaveProperty('id');
  });

  it('reports healthy once the database is connected', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'connected' });
  });

  it('pushes new reports, votes and resolutions to connected browsers', async () => {
    process.env.SIMULATE_AI_VERIFICATION = 'true';
    const server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    const stream = await openStream(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);

    try {
      const reporter = await createUser('Ny');
      const neighbor = await createUser('Os');
      const id = (await postReport(reporter.token, { title: 'Live one', lat: 40.7, lng: -74 })).body.report.id;

      const created = await stream.next('report.created');
      expect(created.report).toMatchObject({ id, title: 'Live one', upvotes: 0 });
      expect(created.report).not.toHaveProperty('isMine');
      expect(JSON.stringify(created)).not.toContain('ny@example.com');

      await request(app).post(`/api/reports/${id}/upvote`).set(auth(neighbor.token));
      expect((await stream.next('report.updated')).report).toMatchObject({ id, upvotes: 1 });

      await request(app).post('/api/reports/resolve').set(auth(neighbor.token)).send({ reportId: id, image: TINY_JPEG_URL });
      await drainJobs();
      expect(await stream.next('report.resolved')).toEqual({ type: 'report.resolved', id });
    } finally {
      stream.close();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
  });

  it('seeds example reports into an empty database only once', async () => {
    await seedDemoReports();
    await seedDemoReports();
    const reports = await Report.find();
    expect(reports).toHaveLength(3);
    expect(reports.every((r) => r.createdAt < new Date(Date.now() - 3600 * 1000))).toBe(true);
  });
});
