# Load tests

These scripts measure how the API holds up under concurrent traffic, so performance changes are
decided by numbers rather than guesses. They use [autocannon](https://github.com/mcollina/autocannon)
against a production build and a dedicated database.

## Running them

```bash
# 1. A database just for load testing (the seed refuses a URI without "load" or "test" in it)
MONGODB_URI=mongodb://127.0.0.1:27017/community-hero-load npm run load:seed   # 5,000 reports + load@example.com

# 2. A production build of the server, pointed at that database
npm run build
NODE_ENV=production PORT=3100 MONGODB_URI=mongodb://127.0.0.1:27017/community-hero-load \
  JWT_SECRET=load-secret LOG_LEVEL=warn node dist/server.cjs

# 3. The scenarios (in another terminal)
BASE_URL=http://localhost:3100 DURATION=10 LABEL=mine npm run load:run
```

`DURATION` is seconds per scenario (default 15), `CONNECTIONS` the concurrent connections (default 25),
and `LABEL` names the output files in `load/results/` (a JSON file and a Markdown table). Start the
server with `READ_CACHE=off` to measure the database path without the read caches.

| Scenario | What it requests |
|---|---|
| Health check | `GET /api/health`: the floor for this machine (Express, middleware, metrics) |
| Nearby reports, random spots | `GET /api/reports` at a new random point each time: every request is a cache miss |
| Nearby reports, neighborhood centers | The same, at the three neighborhood centers the app opens on, which is how real traffic arrives |
| Analytics, random spots / centers | `GET /api/analytics`, one `$geoNear` + `$facet` aggregation |
| Duplicate check | `GET /api/reports/similar` as someone types a report |
| Mission planning | `GET /api/missions/plan`: scoring, clustering and route ordering |
| Post a report | `POST /api/reports`: validation, duplicate check, insert, queued triage job (10 connections) |

## Results

One machine (4 CPUs) running Node 22, MongoDB 7 and autocannon together, 5,000 reports (about 3,300 open),
25 connections, 10 seconds per scenario. Numbers from runs on the same machine vary by about 15% (see
the health check row), so only differences well beyond that mean anything.

| Scenario | Before | After, cache off | After |
|---|---|---|---|
| Health check | 2,814 req/s · p99 19 ms | 2,070 req/s · p99 26 ms | 2,609 req/s · p99 22 ms |
| Nearby reports, random spots | 62 req/s · p99 640 ms | 47 req/s · p99 774 ms | 49 req/s · p99 751 ms |
| Nearby reports, neighborhood centers | (not measured) | 50 req/s · p99 831 ms | **369 req/s · p99 143 ms** |
| Analytics, random spots | 32 req/s · p99 1,087 ms | 23 req/s · p99 1,357 ms | 19 req/s · p99 1,643 ms |
| Analytics, neighborhood centers | (not measured) | 22 req/s · p99 1,666 ms | **2,021 req/s · p99 24 ms** |
| Duplicate check | 307 req/s · p99 137 ms | 250 req/s · p99 216 ms | 246 req/s · p99 170 ms |
| Mission planning | **every request failed (500)** | 54 req/s · p99 648 ms | 52 req/s · p99 716 ms |
| Post a report | 110 req/s · p99 165 ms | 87 req/s · p99 226 ms | 94 req/s · p99 189 ms |

Raw results: [`before.json`](results/before.json), [`after-nocache.json`](results/after-nocache.json),
[`after.json`](results/after.json).

## What the first run found

**A crash.** Every mission planning request returned 500. The structured error log, found through the
request's `X-Request-Id`, said `$size must be an array, but was of type: missing`: reports written
straight to MongoDB (here, by the seed script) have no `verifiedBy` array, and the aggregation took its
size. The app's own reports always have the array, which is why the tests never caught it. Mission
planning, duplicate merging and the report serializer now treat a missing array as empty
(`$ifNull`), and `tests/cache.test.ts` inserts such a report to keep it fixed.

**Geo queries reading too much.** `explain()` showed the nearby-reports `$geoNear` examining about
12,000 documents to return 200 open ones, because the 2dsphere index covered location only and every
document had to be loaded to check its status. A compound index `{ location: "2dsphere", status: 1 }`
brought that to about 4,800 documents and cut the query from 70–77 ms to 46–53 ms on its own. A 2 km
`maxDistance` would have cut it to 11 ms, but it hides every report in a sparse area, so it wasn't used.

## What the second run shows

**The database path didn't get faster under load, even though each query did.** With 25 connections
the server spends most of its time building and sending responses (about 114 KB of JSON for 200
reports), not waiting for MongoDB, so halving the query time barely moves throughput. The "after,
cache off" numbers are within run-to-run noise of "before", which also means the new metrics and
logging middleware cost little.

**Caching is what pays off, where requests repeat.** Most people open the map on one of a few
neighborhood centers, so the same queries come in again and again. The read caches
(`services/cache.ts`) serve those from memory: nearby reports went from 50 to 369 req/s with p99 from
831 ms to 143 ms, and analytics from 22 to 2,021 req/s. Requests at random points miss the cache every
time and gain nothing, as expected.

How the caches stay correct:

- **Nearby reports** are cleared on every report change (`onReportChange` in `services/events.ts`, the
  same hook that drives live updates), so a new report or vote shows up on the next request. Per-viewer
  fields (`isMine`, `hasUpvoted`) are computed after the cache, per request. The trade-off: under a
  steady stream of writes the cache is cleared constantly and the hit rate drops toward zero.
- **Analytics** are cached for 30 seconds and not cleared on writes; a chart that is half a minute
  behind is fine.
- **Single-flight:** when many requests miss the same key at once, one query runs and the rest wait for
  it, instead of all of them hitting MongoDB.
- A query that started before an invalidation is not stored when it finishes, so a slow read can't put
  stale data back into the cache.

## Where to go next

- Shrink the nearby-reports response (send only what the map pins need and load details on click):
  that is now the bottleneck on cache misses.
- Clear the nearby cache only for the area a change touched, so writes elsewhere don't empty it.
- Move the caches to Redis when running more than one server instance; today each instance has its own.
