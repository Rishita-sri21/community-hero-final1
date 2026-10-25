// Load test for the main API paths, using autocannon (HTTP benchmarking in Node).
// Start the server against a seeded database first (see load/README.md), then:
//
//   BASE_URL=http://localhost:3000 npx tsx load/run.ts
//
// Each scenario keeps CONNECTIONS requests in flight for DURATION seconds and reports
// throughput and latency percentiles. Results are written to load/results/<LABEL>.json and .md (LABEL defaults to "latest").
import autocannon from 'autocannon';
import { mkdirSync, writeFileSync } from 'fs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const DURATION = Number(process.env.DURATION || 15);
const CONNECTIONS = Number(process.env.CONNECTIONS || 25);
const MIDTOWN = { lat: 40.7549, lng: -73.984 };

interface Scenario {
  name: string;
  method?: 'GET' | 'POST';
  path: string | (() => string);
  auth?: boolean;
  body?: () => string;
  connections?: number;
}

// Anywhere in the seeded area: every request asks about a different spot (worst case for caching)
const jitter = () => ({ lat: MIDTOWN.lat + (Math.random() - 0.5) * 0.08, lng: MIDTOWN.lng + (Math.random() - 0.5) * 0.06 });
// What the app actually sends for the map and home screens: the viewer's neighborhood center
const NEIGHBORHOODS = [
  { lat: 40.7831, lng: -73.9712 }, // Manhattan
  { lat: 40.6782, lng: -73.9442 }, // Brooklyn
  { lat: 40.7282, lng: -73.7949 }, // Queens
];
const neighborhood = () => NEIGHBORHOODS[Math.floor(Math.random() * NEIGHBORHOODS.length)];

const scenarios: Scenario[] = [
  { name: 'Health check (baseline)', path: '/api/health' },
  { name: 'Nearby reports, random spots', path: () => { const p = jitter(); return `/api/reports?lat=${p.lat}&lng=${p.lng}`; } },
  { name: 'Nearby reports, neighborhood centers', path: () => { const p = neighborhood(); return `/api/reports?lat=${p.lat}&lng=${p.lng}`; } },
  { name: 'Analytics, random spots', path: () => { const p = jitter(); return `/api/analytics?lat=${p.lat}&lng=${p.lng}`; } },
  { name: 'Analytics, neighborhood centers', path: () => { const p = neighborhood(); return `/api/analytics?lat=${p.lat}&lng=${p.lng}`; } },
  {
    name: 'Duplicate check while typing',
    auth: true,
    path: () => { const p = jitter(); return `/api/reports/similar?lat=${p.lat}&lng=${p.lng}&title=Deep%20pothole&description=crack&category=auto`; },
  },
  { name: 'Mission planning (cluster + route)', auth: true, path: () => { const p = jitter(); return `/api/missions/plan?lat=${p.lat}&lng=${p.lng}`; } },
  {
    name: 'Post a report (write + duplicate check + queued triage)',
    method: 'POST',
    auth: true,
    connections: 10,
    path: '/api/reports',
    body: () => { const p = jitter(); return JSON.stringify({ title: 'Load test pothole', description: 'Crack in the asphalt', category: 'auto', urgency: 'auto', ...p }); },
  },
];

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'load@example.com', password: 'load-test-password' }),
  });
  if (!res.ok) throw new Error(`Login failed (${res.status}); seed the database with load/seed.ts first`);
  return (await res.json()).token as string;
}

async function runScenario(s: Scenario, token: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (s.auth) headers.Authorization = `Bearer ${token}`;
  const result = await autocannon({
    url: BASE_URL,
    connections: s.connections ?? CONNECTIONS,
    duration: DURATION,
    requests: [
      {
        method: s.method ?? 'GET',
        headers,
        setupRequest: (req: any) => ({
          ...req,
          path: typeof s.path === 'function' ? s.path() : s.path,
          body: s.body ? s.body() : undefined,
        }),
      },
    ],
  });
  return {
    scenario: s.name,
    connections: s.connections ?? CONNECTIONS,
    requests: result.requests.total,
    rps: Math.round(result.requests.average),
    p50Ms: result.latency.p50,
    p90Ms: result.latency.p90,
    p99Ms: result.latency.p99,
    maxMs: result.latency.max,
    errors: result.errors + result.timeouts,
    non2xx: result.non2xx,
  };
}

async function main() {
  const token = await login();
  const rows = [];
  for (const s of scenarios) {
    process.stdout.write(`Running: ${s.name} ... `);
    const row = await runScenario(s, token);
    console.log(`${row.rps} req/s, p50 ${row.p50Ms} ms, p99 ${row.p99Ms} ms, ${row.non2xx} non-2xx`);
    rows.push(row);
  }

  mkdirSync('load/results', { recursive: true });
  const meta = { date: new Date().toISOString(), baseUrl: BASE_URL, durationSeconds: DURATION, node: process.version };
  const label = process.env.LABEL || 'latest';
  writeFileSync(`load/results/${label}.json`, JSON.stringify({ ...meta, label, rows }, null, 2));
  const table = [
    '| Scenario | Conns | Requests | Req/s | p50 | p90 | p99 | Max | Errors / non-2xx |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.scenario} | ${r.connections} | ${r.requests} | ${r.rps} | ${r.p50Ms} ms | ${r.p90Ms} ms | ${r.p99Ms} ms | ${r.maxMs} ms | ${r.errors} / ${r.non2xx} |`),
  ].join('\n');
  writeFileSync(`load/results/${label}.md`, `${label}: run ${meta.date} against ${BASE_URL}, ${DURATION} s per scenario, Node ${meta.node}.\n\n${table}\n`);
  console.log(`\n${table}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
