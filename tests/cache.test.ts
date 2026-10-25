import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../app';
import User from '../models/User';
import Report from '../models/Report';
import Job from '../models/Job';
import { generateToken } from '../utils/jwt';
import { createCache } from '../services/cache';

const MONGO_URI = process.env.TEST_MONGODB_URI;

describe('read cache', () => {
  beforeEach(() => {
    process.env.READ_CACHE = 'on';
  });
  afterEach(() => {
    process.env.READ_CACHE = 'off';
    vi.useRealTimers();
  });

  it('serves repeat reads from memory until the entry expires', async () => {
    vi.useFakeTimers();
    const cache = createCache<number>({ ttlMs: 1000 });
    const load = vi.fn(async () => 42);

    expect(await cache.get('a', load)).toBe(42);
    expect(await cache.get('a', load)).toBe(42);
    expect(load).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1001);
    await cache.get('a', load);
    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.stats()).toMatchObject({ hits: 1, misses: 2, size: 1 });
  });

  it('runs one load for many simultaneous misses on the same key', async () => {
    const cache = createCache<string>({ ttlMs: 1000 });
    let release!: (v: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => (release = r)));

    const waiting = Promise.all(Array.from({ length: 50 }, () => cache.get('hot', load)));
    release('value');

    expect(await waiting).toEqual(Array(50).fill('value'));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('evicts the least recently used entry when full', async () => {
    const cache = createCache<string>({ ttlMs: 10_000, maxEntries: 2 });
    await cache.get('a', async () => 'A');
    await cache.get('b', async () => 'B');
    await cache.get('a', async () => 'A'); // a is now the most recent
    await cache.get('c', async () => 'C'); // evicts b

    const reload = vi.fn(async () => 'fresh');
    await cache.get('a', reload);
    await cache.get('b', reload);
    expect(reload).toHaveBeenCalledTimes(1); // only b had to be reloaded
  });

  it('does not keep a result that was loading when the data changed', async () => {
    const cache = createCache<string>({ ttlMs: 10_000 });
    let release!: (v: string) => void;
    const loading = cache.get('k', () => new Promise<string>((r) => (release = r)));
    cache.invalidate(); // a write happened while the read was in flight
    release('stale');
    expect(await loading).toBe('stale'); // the caller that asked still gets an answer...

    const reload = vi.fn(async () => 'fresh');
    expect(await cache.get('k', reload)).toBe('fresh'); // ...but it was not cached
  });
});

describe.skipIf(!MONGO_URI)('cached report lists (MongoDB)', () => {
  beforeAll(async () => {
    await mongoose.connect(MONGO_URI!, { dbName: `community-hero-cache-test-${process.pid}-${Date.now()}` });
    await Report.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Report.deleteMany({}), Job.deleteMany({})]);
    process.env.READ_CACHE = 'on';
  });

  afterEach(() => {
    process.env.READ_CACHE = 'off';
  });

  it('never shows a stale list: any report change drops the cached lists', async () => {
    const ana = await User.create({ name: 'Ana', email: 'ana@example.com', password: 'x' });
    const bo = await User.create({ name: 'Bo', email: 'bo@example.com', password: 'x' });
    const auth = (u: any) => ({ Authorization: `Bearer ${generateToken(String(u._id))}` });
    const list = () => request(app).get('/api/reports?lat=40.7001&lng=-74.0001').set(auth(bo));

    const id = (await request(app).post('/api/reports').set(auth(ana)).send({ title: 'One', description: 'x', lat: 40.7, lng: -74 })).body.report.id;
    expect((await list()).body.map((r: any) => r.title)).toEqual(['One']);

    await request(app).post(`/api/reports/${id}/upvote`).set(auth(bo));
    const afterVote = (await list()).body[0];
    expect(afterVote).toMatchObject({ upvotes: 1, hasUpvoted: true });

    // Viewer-specific fields are computed per request, not cached
    const asAna = (await request(app).get('/api/reports?lat=40.7001&lng=-74.0001').set(auth(ana))).body[0];
    expect(asAna).toMatchObject({ isMine: true, hasUpvoted: false });

    await request(app).post('/api/reports').set(auth(ana)).send({ title: 'Two', description: 'y', lat: 40.7, lng: -74.0002 });
    expect((await list()).body).toHaveLength(2);
  });

  it('copes with reports written without the vote arrays (imports, old data)', async () => {
    const user = await User.create({ name: 'Cy', email: 'cy@example.com', password: 'x' });
    const auth = { Authorization: `Bearer ${generateToken(String(user._id))}` };
    // Written with the driver, so Mongoose defaults (empty arrays) are not applied
    await Report.collection.insertOne({
      title: 'Imported pothole', description: 'From the old system', category: 'Pothole', urgency: 'High',
      status: 'open', upvotes: 3, location: { type: 'Point', coordinates: [-74, 40.7] }, createdAt: new Date(), reporter: { name: 'Import' },
    } as any);

    expect((await request(app).get('/api/missions/plan?lat=40.7&lng=-74').set(auth)).status).toBe(200);
    expect((await request(app).get('/api/reports?lat=40.7&lng=-74').set(auth)).body[0]).toMatchObject({ title: 'Imported pothole', hasUpvoted: false });
  });
});
