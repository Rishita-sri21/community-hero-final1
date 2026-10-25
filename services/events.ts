import { EventEmitter } from 'events';
import type { Response } from 'express';
import type { Report } from '../src/types';

// Live updates pushed to every open browser over Server-Sent Events (GET /api/events).
// The bus lives in this process's memory, which is right for a single server instance.
// Running several instances would need a shared channel such as MongoDB change streams.

export type LiveEvent =
  | { type: 'report.created'; report: Report }
  | { type: 'report.updated'; report: Report }
  | { type: 'report.resolved'; id: string }
  // A report was closed as a duplicate; `into` is the report it was merged into, with the combined votes
  | { type: 'report.merged'; id: string; into: Report };

const bus = new EventEmitter();
bus.setMaxListeners(0); // one listener per open browser tab

const HEARTBEAT_MS = 25_000;

/** Sends an event to everyone connected. Fields that depend on the viewer are left out. */
export function publish(event: LiveEvent) {
  if ('report' in event) {
    const { isMine, hasUpvoted, hasVerified, distanceKm, ...shared } = event.report;
    event = { ...event, report: shared };
  }
  if (event.type === 'report.merged') {
    const { isMine, hasUpvoted, hasVerified, distanceKm, ...shared } = event.into;
    event = { ...event, into: shared };
  }
  bus.emit('event', event);
}

/** Keeps the response open as an event stream until the browser disconnects. */
export function streamEvents(res: Response) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // stops proxies from holding events back
  });
  res.flushHeaders();
  res.write('retry: 5000\n\n'); // browsers reconnect after 5 seconds if the stream drops

  const send = (event: LiveEvent) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  };
  // A comment line every 25 seconds keeps hosting proxies from closing an idle connection
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

  bus.on('event', send);
  res.on('close', () => {
    clearInterval(heartbeat);
    bus.off('event', send);
  });
}

export function listenerCount() {
  return bus.listenerCount('event');
}
