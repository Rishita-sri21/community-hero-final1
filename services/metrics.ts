import client from 'prom-client';

// Prometheus metrics, served at GET /metrics (see app.ts). Prometheus, Grafana Cloud or any
// compatible agent scrapes that endpoint and keeps the history; the admin console also reads
// the same numbers from this process for a quick look.
//
// Naming follows Prometheus conventions: base units (seconds), _total for counters, and
// low-cardinality labels only (route templates like /api/reports/:id, never raw URLs or ids).

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry }); // CPU, memory, event loop lag, GC

// Buckets from 5 ms to 10 s: API calls should land in the low ones, AI calls in the high ones
const LATENCY_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency by route template, method and status code',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: LATENCY_BUCKETS,
  registers: [registry],
});

export const httpInFlight = new client.Gauge({
  name: 'http_requests_in_flight',
  help: 'HTTP requests being handled right now',
  registers: [registry],
});

export const jobsProcessed = new client.Counter({
  name: 'jobs_processed_total',
  help: 'Background job attempts by type and outcome (done, retrying, failed)',
  labelNames: ['type', 'outcome'] as const,
  registers: [registry],
});

export const jobDuration = new client.Histogram({
  name: 'job_duration_seconds',
  help: 'Time one attempt of a background job took',
  labelNames: ['type'] as const,
  buckets: LATENCY_BUCKETS,
  registers: [registry],
});

export const jobWait = new client.Histogram({
  name: 'job_queue_wait_seconds',
  help: 'Time from enqueueing (or the retry time) until a worker started the attempt',
  labelNames: ['type'] as const,
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 15, 60, 300],
  registers: [registry],
});

export const aiCalls = new client.Histogram({
  name: 'ai_request_duration_seconds',
  help: 'Gemini calls by operation and outcome (ok, error)',
  labelNames: ['operation', 'outcome'] as const,
  buckets: LATENCY_BUCKETS,
  registers: [registry],
});

/** Times `call` as an AI request, recording success or failure. */
export async function timeAiCall<T>(operation: string, call: () => Promise<T>): Promise<T> {
  const end = aiCalls.startTimer({ operation });
  try {
    const result = await call();
    end({ outcome: 'ok' });
    return result;
  } catch (err) {
    end({ outcome: 'error' });
    throw err;
  }
}

/** Registers a gauge whose value is read when metrics are scraped (e.g. queue depth from the database). */
export function gaugeFromCallback(name: string, help: string, labelNames: string[], read: () => Promise<Array<{ labels: Record<string, string>; value: number }>>) {
  return new client.Gauge({
    name,
    help,
    labelNames,
    registers: [registry],
    async collect() {
      this.reset();
      try {
        for (const { labels, value } of await read()) this.set(labels, value);
      } catch {
        // A failed read (database briefly down) leaves the gauge empty for this scrape
      }
    },
  });
}

/**
 * Estimates a quantile from histogram buckets by linear interpolation inside the bucket that
 * contains it, the same way Prometheus's histogram_quantile() does.
 */
export function quantileFromBuckets(buckets: Array<{ le: number; count: number }>, q: number): number | null {
  const total = buckets[buckets.length - 1]?.count ?? 0;
  if (total === 0) return null;
  const rank = q * total;
  let previousLe = 0;
  let previousCount = 0;
  for (const { le, count } of buckets) {
    if (count >= rank) {
      if (le === Infinity) return previousLe; // above the largest bucket: report its bound
      const inBucket = count - previousCount;
      return inBucket === 0 ? le : previousLe + ((le - previousLe) * (rank - previousCount)) / inBucket;
    }
    previousLe = le;
    previousCount = count;
  }
  return previousLe;
}

export interface LatencySummary {
  labels: Record<string, string>;
  count: number;
  errors: number;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
}

/**
 * Groups a histogram's series by some of its labels (e.g. route and method, summing over status)
 * and gives each group its count, error count and latency percentiles since the process started.
 */
export async function summarizeHistogram(
  histogram: client.Histogram<string>,
  groupBy: string[],
  isError: (labels: Record<string, string>) => boolean
): Promise<LatencySummary[]> {
  const { name, values } = await histogram.get();
  const groups = new Map<string, { labels: Record<string, string>; buckets: Map<number, number>; count: number; errors: number }>();

  for (const v of values) {
    const labels = v.labels as Record<string, string>;
    const key = groupBy.map((l) => labels[l]).join(' ');
    const group = groups.get(key) ?? { labels: Object.fromEntries(groupBy.map((l) => [l, String(labels[l])])), buckets: new Map(), count: 0, errors: 0 };
    groups.set(key, group);
    if (v.metricName === `${name}_bucket`) {
      // Cumulative bucket counts can be added across the series being merged
      const le = labels.le === '+Inf' ? Infinity : Number(labels.le);
      group.buckets.set(le, (group.buckets.get(le) ?? 0) + v.value);
    } else if (v.metricName === `${name}_count`) {
      group.count += v.value;
      if (isError(labels)) group.errors += v.value;
    }
  }

  const ms = (seconds: number | null) => (seconds === null ? null : Math.round(seconds * 10000) / 10);
  return [...groups.values()]
    .map((g) => {
      const buckets = [...g.buckets.entries()].sort((a, b) => a[0] - b[0]).map(([le, count]) => ({ le, count }));
      return {
        labels: g.labels,
        count: g.count,
        errors: g.errors,
        p50Ms: ms(quantileFromBuckets(buckets, 0.5)),
        p95Ms: ms(quantileFromBuckets(buckets, 0.95)),
        p99Ms: ms(quantileFromBuckets(buckets, 0.99)),
      };
    })
    .sort((a, b) => b.count - a.count);
}

/** What the admin console shows: request and AI latency by route/operation, and process health. */
export async function performanceSnapshot() {
  const [routes, ai, jobs, metrics] = await Promise.all([
    summarizeHistogram(httpDuration, ['method', 'route'], (l) => Number(l.status) >= 500),
    summarizeHistogram(aiCalls, ['operation'], (l) => l.outcome === 'error'),
    summarizeHistogram(jobDuration, ['type'], () => false),
    registry.getMetricsAsJSON(),
  ]);
  const value = (metricName: string) => (metrics.find((m) => m.name === metricName) as any)?.values?.[0]?.value as number | undefined;
  const lag = value('nodejs_eventloop_lag_p99_seconds');
  const rss = value('process_resident_memory_bytes');
  return {
    uptimeSeconds: Math.round(process.uptime()),
    eventLoopLagP99Ms: lag === undefined ? null : Math.round(lag * 10000) / 10,
    memoryRssMb: rss === undefined ? null : Math.round(rss / 1024 / 1024),
    routes: routes.map(({ labels, ...rest }) => ({ method: labels.method, route: labels.route, ...rest })),
    ai: ai.map(({ labels, ...rest }) => ({ operation: labels.operation, ...rest })),
    jobs: jobs.map(({ labels, errors, ...rest }) => ({ type: labels.type, ...rest })),
  };
}
