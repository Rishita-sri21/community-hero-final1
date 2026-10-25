import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from '../app';
import User from '../models/User';
import Report from '../models/Report';
import Job from '../models/Job';
import { generateToken } from '../utils/jwt';
import { DUPLICATE_RADIUS_M, LIKELY_THRESHOLD, SUGGEST_THRESHOLD, duplicateScore, textSimilarity, tokens } from '../services/duplicates';

const MONGO_URI = process.env.TEST_MONGODB_URI;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
// About 11 m per 0.0001 degree of latitude
const BASE = { lat: 40.7, lng: -74 };

describe('duplicate scoring', () => {
  it('drops stopwords and simple endings', () => {
    expect(tokens('The potholes keep getting deeper on Main Street')).toEqual(['pothole', 'deeper', 'main']);
    expect(tokens('Leaking hydrant, flooded sidewalk')).toEqual(['leak', 'hydrant', 'flood', 'sidewalk']);
  });

  it('rates the same problem in other words as similar, and unrelated problems as not', () => {
    const same = textSimilarity('Huge pothole on 5th Ave', 'Deep potholes on 5th avenue near the bus stop');
    const typo = textSimilarity('Big pot hole', 'Big pothole');
    const other = textSimilarity('Huge pothole on 5th Ave', 'Graffiti on the library wall');
    // Short texts share few words, so text alone stays modest; distance and category do the rest
    expect(same).toBeGreaterThan(0.15);
    expect(typo).toBeGreaterThan(0.3);
    expect(other).toBe(0);
  });

  it('needs closeness: the same text farther than the radius is not a duplicate', () => {
    const report = { title: 'Broken streetlight', description: 'Lamp out at the corner', category: 'Streetlight' };
    const near = duplicateScore(report, report, 10);
    expect(near.score).toBeGreaterThan(LIKELY_THRESHOLD);
    expect(near.reasons).toEqual(['10 m away', 'both Streetlight', 'shared words: broken, streetlight, lamp']);
    expect(duplicateScore(report, report, DUPLICATE_RADIUS_M + 1).score).toBe(0);
  });

  it('guesses the category from the words when the reporter left it to the AI', () => {
    const existing = { title: 'Overflowing bins', description: 'Trash everywhere', category: 'Waste Management' };
    const withGuess = duplicateScore({ title: 'Garbage piling up', description: 'Nobody collected it', category: 'auto' }, existing, 30);
    expect(withGuess.reasons).toContain('both Waste Management');
  });

  it('keeps distinct problems at the same spot apart', () => {
    const score = duplicateScore(
      { title: 'Graffiti on bench', description: 'Spray paint tags', category: 'Graffiti' },
      { title: 'Broken streetlight', description: 'Lamp out', category: 'Streetlight' },
      5
    ).score;
    expect(score).toBeLessThan(SUGGEST_THRESHOLD);
  });
});

describe.skipIf(!MONGO_URI)('duplicates (MongoDB)', () => {
  beforeAll(async () => {
    await mongoose.connect(MONGO_URI!, { dbName: `community-hero-dup-test-${process.pid}-${Date.now()}` });
    await Report.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Report.deleteMany({}), Job.deleteMany({})]);
  });

  async function createUser(name: string, extra: Record<string, unknown> = {}) {
    const user = await User.create({ name, email: `${name.toLowerCase()}@example.com`, password: 'x', ...extra });
    return { user, token: generateToken(String(user._id)) };
  }

  async function post(token: string, body: Record<string, unknown>) {
    return request(app).post('/api/reports').set(auth(token)).send({ ...BASE, ...body });
  }

  it('suggests nearby open reports that look like the one being written', async () => {
    const ana = await createUser('Ana');
    const bo = await createUser('Bo');
    const pothole = (await post(ana.token, { title: 'Deep pothole', description: 'Big hole in the asphalt', category: 'Pothole' })).body.report.id;
    await post(ana.token, { title: 'Graffiti on wall', description: 'Spray paint', category: 'Graffiti' });
    await post(ana.token, { title: 'Deep pothole', description: 'Big hole in the asphalt', category: 'Pothole', lat: 40.71 }); // 1.1 km away
    await Report.create({ reporter: { name: 'X' }, title: 'Deep pothole', description: 'Fixed', category: 'Pothole', status: 'resolved', location: { type: 'Point', coordinates: [BASE.lng, BASE.lat] } });

    const res = await request(app)
      .get('/api/reports/similar')
      .query({ lat: 40.7003, lng: -74, title: 'Pothole getting deeper', description: 'hole in the road', category: 'auto' })
      .set(auth(bo.token));

    expect(res.status).toBe(200);
    expect(res.body.radiusMeters).toBe(DUPLICATE_RADIUS_M);
    expect(res.body.matches).toHaveLength(1);
    expect(res.body.matches[0]).toMatchObject({ id: pothole, title: 'Deep pothole', distanceMeters: 33 });
    expect(res.body.matches[0].reasons).toContain('both Pothole');

    expect((await request(app).get('/api/reports/similar').query({ lat: 40.7, lng: -74 }).set(auth(bo.token))).status).toBe(400);
  });

  it('flags a new report that is probably a duplicate', async () => {
    const ana = await createUser('Ana');
    const bo = await createUser('Bo');
    const first = (await post(ana.token, { title: 'Broken streetlight', description: 'Lamp out at the corner', category: 'Streetlight' })).body.report.id;

    const res = await post(bo.token, { title: 'Streetlight broken', description: 'The lamp is out', category: 'Streetlight', lat: 40.7001 });

    expect(res.status).toBe(201);
    expect(res.body.similar[0]).toMatchObject({ id: first });
    expect(res.body.report.possibleDuplicate).toMatchObject({ id: first, title: 'Broken streetlight' });
    expect(res.body.report.possibleDuplicate.score).toBeGreaterThanOrEqual(LIKELY_THRESHOLD);

    const unrelated = await post(bo.token, { title: 'Overflowing bins', description: 'Trash', category: 'Waste Management' });
    expect(unrelated.body.report.possibleDuplicate).toBeUndefined();
  });

  it("merges a duplicate into the original, carrying its supporters over", async () => {
    const ana = await createUser('Ana');
    const bo = await createUser('Bo');
    const cy = await createUser('Cy');
    const di = await createUser('Di');
    const original = (await post(ana.token, { title: 'Broken streetlight', description: 'Lamp out', category: 'Streetlight' })).body.report.id;
    await Report.updateOne({ _id: original }, { $set: { upvotes: 10 } }); // seeded reports have counts without upvoters
    const duplicate = (await post(bo.token, { title: 'Streetlight out', description: 'Dark', category: 'Streetlight' })).body.report.id;
    await request(app).post(`/api/reports/${duplicate}/upvote`).set(auth(cy.token));
    await request(app).post(`/api/reports/${duplicate}/upvote`).set(auth(ana.token)); // the original's reporter
    await request(app).post(`/api/reports/${duplicate}/verify`).set(auth(di.token));

    expect((await request(app).post(`/api/reports/${duplicate}/duplicate`).set(auth(cy.token)).send({ of: original })).status).toBe(403);
    expect((await request(app).post(`/api/reports/${duplicate}/duplicate`).set(auth(bo.token)).send({ of: duplicate })).status).toBe(400);

    const res = await request(app).post(`/api/reports/${duplicate}/duplicate`).set(auth(bo.token)).send({ of: original });

    expect(res.status).toBe(200);
    // +1 for Cy, +1 for Bo (the duplicate's reporter); Ana can't upvote her own report
    expect(res.body.report).toMatchObject({ id: original, upvotes: 12, verified: true, hasUpvoted: true });
    const merged = await Report.findById(original).lean();
    expect(merged!.upvotedBy.map(String).sort()).toEqual([String(bo.user._id), String(cy.user._id)].sort());
    expect(merged!.verifiedBy.map(String)).toEqual([String(di.user._id)]);
    expect(await Report.findById(duplicate).lean()).toMatchObject({ status: 'duplicate' });
    expect(String((await Report.findById(duplicate).lean())!.duplicateOf)).toBe(original);

    // The duplicate leaves the open list
    const list = (await request(app).get('/api/reports')).body.map((r: any) => r.id);
    expect(list).toEqual([original]);
  });

  it('lets admins merge, and refuses when the target is closed', async () => {
    const ana = await createUser('Ana');
    const admin = await createUser('Ad', { role: 'Civil Servant' });
    const a = (await post(ana.token, { title: 'Leak', description: 'Water', category: 'Water Leakage' })).body.report.id;
    const b = (await post(ana.token, { title: 'Leaking pipe', description: 'Water', category: 'Water Leakage' })).body.report.id;
    const closed = (await post(ana.token, { title: 'Old leak', description: 'Water', category: 'Water Leakage' })).body.report.id;
    await Report.updateOne({ _id: closed }, { $set: { status: 'resolved' } });

    const refused = await request(app).post(`/api/reports/${b}/duplicate`).set(auth(admin.token)).send({ of: closed });
    expect(refused.status).toBe(409);
    expect((await Report.findById(b).lean())!.status).toBe('open');

    expect((await request(app).post(`/api/reports/${b}/duplicate`).set(auth(admin.token)).send({ of: a })).status).toBe(200);
    expect((await request(app).post(`/api/reports/${b}/duplicate`).set(auth(admin.token)).send({ of: a })).status).toBe(404);
  });
});
