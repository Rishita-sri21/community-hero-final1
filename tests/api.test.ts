import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../app';

// These tests cover routes that don't need MongoDB. Routes that read or write users
// need a database and are not covered here yet.

describe('health', () => {
  it('reports the server is up', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('reports', () => {
  it('returns the seed reports when no data file exists yet', async () => {
    const res = await request(app).get('/api/reports');
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => r.id)).toEqual(['rep-1', 'rep-2', 'rep-3']);
  });

  it('rejects a report without a title or description', async () => {
    const noTitle = await request(app).post('/api/reports').send({ description: 'Broken light' });
    expect(noTitle.status).toBe(400);

    const blankDescription = await request(app).post('/api/reports').send({ title: 'Light', description: '   ' });
    expect(blankDescription.status).toBe(400);
  });

  it('creates a report, keeps its exact map location and saves it', async () => {
    const res = await request(app).post('/api/reports').send({
      title: 'Leaking hydrant',
      description: 'Water has been running onto the sidewalk since morning.',
      district: 'Westside',
      category: 'Water Leakage',
      lat: 40.7201,
      lng: -74.0011,
    });

    expect(res.status).toBe(201);
    expect(res.body.points).toBeNull(); // anonymous request: no points awarded
    expect(res.body.report).toMatchObject({
      title: 'Leaking hydrant',
      district: 'Westside',
      lat: 40.7201,
      lng: -74.0011,
      upvotes: 0,
      verified: false,
    });

    const list = await request(app).get('/api/reports');
    expect(list.body[0].id).toBe(res.body.report.id);
  });

  it('ignores coordinates that are out of range', async () => {
    const res = await request(app).post('/api/reports').send({
      title: 'Graffiti',
      description: 'Fresh tags on the underpass wall.',
      lat: 999,
      lng: 'not-a-number',
    });

    expect(res.status).toBe(201);
    expect(res.body.report.lat).toBeUndefined();
    expect(res.body.report.lng).toBeUndefined();
  });

  it('upvotes an existing report and 404s for an unknown one', async () => {
    const before = (await request(app).get('/api/reports')).body.find((r: any) => r.id === 'rep-2');

    const res = await request(app).post('/api/reports/rep-2/upvote');
    expect(res.status).toBe(200);
    expect(res.body.upvotes).toBe(before.upvotes + 1);

    const missing = await request(app).post('/api/reports/does-not-exist/upvote');
    expect(missing.status).toBe(404);
  });
});

describe('authentication guards', () => {
  it('rejects /api/auth/me without a token or with a bad one', async () => {
    const noToken = await request(app).get('/api/auth/me');
    expect(noToken.status).toBe(401);

    const badToken = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(badToken.status).toBe(401);
  });

  it('rejects point changes from anonymous users', async () => {
    const res = await request(app).post('/api/users/add-points').send({ amount: 1000 });
    expect(res.status).toBe(401);
  });

  it('rejects registration with missing fields', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'a@example.com' });
    expect(res.status).toBe(400);
  });

  it('keeps admin audit logs away from anonymous users', async () => {
    const res = await request(app).get('/api/admin/audit-logs');
    expect(res.status).toBe(401);
  });
});
