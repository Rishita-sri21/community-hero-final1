import { AsyncLocalStorage } from 'async_hooks';

// Structured logging: one JSON object per line, so a log service (Render's log stream, Datadog,
// Loki...) can filter by field. Every line written while handling a request or running a job
// automatically carries that request's id (and the job's id), so all the lines for one user
// action can be found together, including work a background job did later on its behalf.
//
// LOG_LEVEL: debug | info (default) | warn | error | silent
// LOG_FORMAT=pretty prints readable lines instead of JSON, for local development.

export interface LogContext {
  requestId?: string;
  userId?: string;
  jobId?: string;
  jobType?: string;
}

const storage = new AsyncLocalStorage<LogContext>();

/** Runs `fn` with `context` attached to every log line written inside it, however deep. */
export function withLogContext<T>(context: LogContext, fn: () => T): T {
  return storage.run({ ...storage.getStore(), ...context }, fn);
}

/** The context of the request or job currently running, if any. Mutable, e.g. to add the user. */
export function currentLogContext(): LogContext | undefined {
  return storage.getStore();
}

type Level = 'debug' | 'info' | 'warn' | 'error';
const RANK: Record<Level | 'silent', number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

function threshold() {
  const level = (process.env.LOG_LEVEL || 'info') as Level | 'silent';
  return RANK[level] ?? RANK.info;
}

function serializeError(err: Error) {
  return { name: err.name, message: err.message, stack: err.stack?.split('\n').slice(0, 6).join('\n') };
}

// Accepts console-style arguments: log.error('Upload failed:', err) or log.info('done', { ms: 12 })
function write(level: Level, msg: string, args: unknown[]) {
  if (RANK[level] < threshold()) return;

  const fields: Record<string, unknown> = {};
  const extra: string[] = [];
  for (const arg of args) {
    if (arg instanceof Error) fields.err = serializeError(arg);
    else if (arg && typeof arg === 'object' && !Array.isArray(arg)) Object.assign(fields, arg);
    else if (arg !== undefined) extra.push(String(arg));
  }
  const message = [msg.replace(/:\s*$/, ''), ...extra].join(' ');
  const line = { time: new Date().toISOString(), level, msg: message, ...storage.getStore(), ...fields };
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;

  if (process.env.LOG_FORMAT === 'pretty') {
    const { time, level: _l, msg: _m, ...rest } = line;
    const tail = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
    stream.write(`${time.slice(11, 23)} ${level.toUpperCase().padEnd(5)} ${message}${tail}\n`);
  } else {
    stream.write(`${JSON.stringify(line)}\n`);
  }
}

export const log = {
  debug: (msg: string, ...args: unknown[]) => write('debug', msg, args),
  info: (msg: string, ...args: unknown[]) => write('info', msg, args),
  warn: (msg: string, ...args: unknown[]) => write('warn', msg, args),
  error: (msg: string, ...args: unknown[]) => write('error', msg, args),
};
