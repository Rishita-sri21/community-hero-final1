import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../app';

// These tests cover routes that don't need MongoDB. Rules that touch users and points
// are in points.test.ts, which runs against a real MongoDB.

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

  it('requires sign-in to create, upvote, verify or resolve reports', async () => {
    const create = await request(app).post('/api/reports').send({ title: 'Light', description: 'Out' });
    expect(create.status).toBe(401);

    expect((await request(app).post('/api/reports/rep-1/upvote')).status).toBe(401);
    expect((await request(app).post('/api/reports/rep-1/verify')).status).toBe(401);
    expect((await request(app).post('/api/reports/resolve').send({ reportId: 'rep-1', image: 'x' })).status).toBe(401);
  });
});

describe('authentication guards', () => {
  it('rejects /api/auth/me without a token or with a bad one', async () => {
    const noToken = await request(app).get('/api/auth/me');
    expect(noToken.status).toBe(401);

    const badToken = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(badToken.status).toBe(401);
  });

  it('rejects point-earning and spending routes from anonymous users', async () => {
    expect((await request(app).post('/api/actions/green').send({ actionId: 'food-bank' })).status).toBe(401);
    expect((await request(app).post('/api/rewards/redeem').send({ rewardId: 'rwd-1' })).status).toBe(401);
    expect((await request(app).post('/api/users/join-squad').send({ squadId: 'sq-1' })).status).toBe(401);
  });

  it('has no endpoint that adds arbitrary points', async () => {
    const res = await request(app).post('/api/users/add-points').send({ amount: 1000 });
    expect(res.status).toBe(404);
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
