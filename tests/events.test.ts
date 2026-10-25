import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../app';
import { listenerCount, publish } from '../services/events';
import { openStream } from './helpers/stream';

describe('live events stream', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });

  it('streams published events without viewer-specific fields', async () => {
    const stream = await openStream(baseUrl);
    expect(stream.res.headers.get('content-type')).toContain('text/event-stream');

    publish({
      type: 'report.updated',
      report: { id: 'r1', upvotes: 3, isMine: true, hasUpvoted: true, hasVerified: false, distanceKm: 2 } as any,
    });

    const event = await stream.next('report.updated');
    expect(event.report).toEqual({ id: 'r1', upvotes: 3 });
    stream.close();
  });

  it('stops sending to a browser once it disconnects', async () => {
    await new Promise((r) => setTimeout(r, 100)); // let earlier tests' connections finish closing
    const before = listenerCount();
    const stream = await openStream(baseUrl);
    await new Promise((r) => setTimeout(r, 50));
    expect(listenerCount()).toBe(before + 1);

    stream.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(listenerCount()).toBe(before);
  });
});
