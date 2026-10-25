# Community Hero

A hyperlocal civic platform where residents report neighborhood problems (potholes, broken streetlights, leaks, waste), verify each other's reports on a live map, and prove fixes with a photo that an AI vision model checks. Contributions earn Hero Points that can be spent in a rewards store.

## Features

- **Map-based reporting:** click anywhere on an interactive Leaflet map to drop a report pin, optionally with a photo.
- **Your neighborhood first:** the map opens on the neighborhood you picked at sign-up, and reports are sorted by distance from it.
- **Background job queue:** slow or flaky AI work runs from a durable queue stored in MongoDB (`services/jobs.ts`), not inside HTTP requests. Workers claim jobs atomically, hold a lease they renew while working, retry failures with exponential backoff and jitter, and take over jobs from a worker that crashed. Admins see the backlog, timings and failures, and can retry failed jobs.
- **AI triage:** after a report is posted, a background job picks its category and urgency from the photo and text (Gemini), or with transparent keyword rules when Gemini isn't configured or keeps failing. It fills in only the fields the reporter left to "Let AI decide", and each report shows what decided it.
- **Photo-verified resolution:** capture or upload a photo of the fix; a background job has Gemini Vision compare it with the reporter's "before" photo (when there is one) and judge whether the issue is resolved, while the app shows the job's progress. Resolved reports are kept with their fix photo, the model's confidence and the job that checked it.
- **Live updates:** new reports, vote counts and resolutions appear for everyone as they happen, over Server-Sent Events.
- **Mission planner:** scores open reports by urgency, community support and age, groups nearby ones (union-find clustering), picks the most valuable group within reach and orders its stops into a short walking route (nearest neighbor plus 2-opt and relocate moves), drawn on the map. Gemini, when configured, only phrases the briefing from those numbers.
- **Neighborhood analytics:** open and resolved counts, resolution rate, median and average time to fix, a 7-day reported/resolved chart and a per-category breakdown, computed by a single MongoDB aggregation (`$geoNear` + `$facet`).
- **Before and after stories:** every resolved report with its fix photo, next to the reporter's original photo.
- **Civic assistant:** a Gemini chat that is given the app's rules and the open reports nearest the user, looked up by the server. Without a Gemini key it says it's unavailable rather than answering with canned text.
- **Squads and your impact:** three standing squads, each looking after a few report categories. Member counts, open reports near you and fixes by members are counted from the database; the "Your impact" card shows your real reports, fixes, verifications, upvotes received, rank, and badges earned from them.
- **Notifications:** when a neighbor upvotes, verifies or fixes your report, it shows up under the bell (stored in MongoDB, expire after 60 days).
- **Points and rewards:** earn points for reporting, verifying and resolving; spend them in the store. Every award and spend is decided and applied by the server (see [Points rules](#points-rules)).
- **Roles:** Volunteers, Civil Servants and Organizers; privileged roles get an admin console with live database measurements (version, ping, storage), the audit log, and NDJSON exports streamed from a database cursor.

## Architecture

```
Browser (React SPA, src/)
   │  all HTTP calls go through src/lib/api.ts (JSON + Bearer JWT)
   ▼
Express API (app.ts, started by server.ts)
   ├── MongoDB via Mongoose ─ users, reports (2dsphere geo index), notifications, audit logs, jobs
   ├── MongoDB GridFS ─────── report and fix photos, served at /api/images/:id
   ├── Job worker ─────────── runs queued jobs (photo checks, triage) with retries; started by server.ts
   │     └── Google Gemini ── triage and photo verification (optional)
   ├── Google Gemini ──────── chat, mission briefings (optional)
   └── GET /api/events ────── live updates pushed to every open browser (Server-Sent Events)
```

How a fix photo is checked:

```
POST /api/reports/resolve ── validate, store photo, insert job ──▶ 202 { job }
                                                                     │
browser polls GET /api/jobs/:id ◀── worker claims job (findOneAndUpdate, lease)
                                        ├─ Gemini says fixed ─▶ resolve report, award points ─▶ done
                                        ├─ Gemini says no ────▶ delete photo ─────────────────▶ done
                                        └─ error/timeout ─────▶ pending again after backoff (up to 3 tries) ─▶ failed
```

In development, `server.ts` runs Vite in middleware mode, so one process on port 3000 serves both the API and the hot-reloading frontend. In production it serves the prebuilt `dist/` folder.

## Tech stack

React 19 · TypeScript · Vite 6 · Tailwind CSS 4 · Leaflet · Motion · Express 4 · MongoDB/Mongoose · JWT + bcrypt · Google Gemini (`@google/genai`) · Vitest + Supertest · GitHub Actions

## Getting started

Requirements: Node.js 22 and a MongoDB database (a free MongoDB Atlas cluster works).

```bash
npm ci
cp .env.example .env   # then fill in MONGODB_URI and JWT_SECRET
npm run dev            # http://localhost:3000
```

On first start the server creates three example reports in New York and four demo accounts, all with the password `password123`: `elena@example.com` (Organizer), `marcus@example.com` (Civil Servant), `samira@example.com` and `sarah@example.com` (Volunteers).

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | yes | MongoDB connection string |
| `JWT_SECRET` | yes | Secret used to sign login tokens |
| `GEMINI_API_KEY` | no | Enables AI features; without it they use offline fallbacks |
| `VITE_API_URL` | no | API base URL for the frontend; defaults to same-origin in dev and the deployed backend in production builds |
| `PORT` | no | Server port, default `3000` |
| `CORS_ORIGINS` | no | Comma-separated sites allowed to call the API from a browser (e.g. your Vercel URL); unset allows any |
| `SIMULATE_AI_VERIFICATION` | no | Demo only: accept resolution photos without Gemini |
| `RUN_JOB_WORKER` | no | Set to `false` to not run the background job worker in this process (e.g. when a separate worker runs) |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the API + frontend with hot reload |
| `npm run lint` | Type-check the whole project with `tsc` |
| `npm test` | Run the tests. Set `TEST_MONGODB_URI=mongodb://127.0.0.1:27017` to include the points and reports tests, which need MongoDB |
| `npm run build` | Build the frontend to `dist/` and bundle the server to `dist/server.cjs` |
| `npm start` | Start the server (set `NODE_ENV=production` to serve `dist/`) |

CI runs type-check, tests and build on every pull request.

## Deploying

The backend runs on any Node host (it's deployed on Render); the frontend can be served by the same server or by a static host such as Vercel, with `VITE_API_URL` pointing at the backend.

- Set `MONGODB_URI`, `JWT_SECRET` and, for real photo checks, `GEMINI_API_KEY`. Set `CORS_ORIGINS` to the frontend's URL.
- Point the host's health check at `/api/health`. It returns 503 while MongoDB is unreachable, so the host can hold traffic or restart the server.
- The server trusts one proxy hop (`trust proxy`), which is right for Render, Railway, Fly and similar hosts. Without it, every visitor would share a single login rate limit.
- On `SIGTERM` the server stops accepting connections and closes MongoDB cleanly, so deploys don't cut requests off mid-write.

## Points rules

The browser never tells the server how many points to add. Each rule lives in `services/points.ts` and `app.ts`, with values in `src/shared/catalog.ts`:

| Action | Points | Limit |
|---|---|---|
| Post a report | +20 | first 10 reports per day |
| Upvote a report | +5 | once per report, not your own |
| Verify a report | +15 | once per report, not your own |
| Resolve a report with a verified photo | +150 | 0 when closing your own report |
| Log a green action | +10 to +25 | each action once per day |
| Join a squad | +30 / +50 | first join only |
| Redeem a reward | catalogue price | only with enough balance |

Point changes are single atomic MongoDB updates (`$inc`, conditional `findOneAndUpdate`), so simultaneous requests can't overspend or double-award.

## API overview

| Method | Path | Auth |
|---|---|---|
| `POST` | `/api/auth/register`, `/api/auth/login` | rate-limited |
| `GET` | `/api/auth/me` | required |
| `GET` | `/api/reports?lat=&lng=` | public; nearest first with `distanceKm` when a location is given (adds `isMine`, `hasUpvoted`, `hasVerified` when signed in) |
| `GET` | `/api/images/:id` | public |
| `POST` | `/api/reports`, `/api/reports/:id/upvote`, `/api/reports/:id/verify` | required |
| `POST` | `/api/reports/resolve` | required; answers `202` with the queued photo-check job |
| `GET` | `/api/jobs/:id` | required; the job's creator or an admin |
| `POST` | `/api/actions/green`, `/api/rewards/redeem` | required |
| `POST` | `/api/users/update-district`, `/join-squad`, `/leave-squad` | required |
| `GET` | `/api/leaderboard` | public |
| `POST` | `/api/assistant/chat` | required (503 without a Gemini key) |
| `GET` | `/api/missions/plan?lat=&lng=` | required |
| `GET` | `/api/analytics?lat=&lng=` | public |
| `GET` | `/api/stories` | public |
| `GET` | `/api/squads`, `/api/users/me/stats` | required |
| `GET` | `/api/notifications`; `POST` `/api/notifications/read` | required |
| `GET` | `/api/admin/audit-logs`, `/api/admin/db/status`, `/api/admin/export/:collection`, `/api/admin/jobs` | Civil Servant or Organizer |
| `POST` | `/api/admin/jobs/:id/retry` | Civil Servant or Organizer |
| `GET` | `/api/events` | public (Server-Sent Events: `report.created`, `report.updated`, `report.resolved`) |
| `GET` | `/api/health` | public (503 while the database is unreachable) |

## Known limitations

This project is being upgraded in stages. Current known gaps:

- Green actions are self-reported, so they're limited to once per action per day rather than proven.
- Mission distances are straight lines between stops; walking time adds 30% for streets. A routing engine (for example OSRM) would give real street paths.
- Accounts whose district isn't one of the onboarding neighborhoods (older accounts, and demo accounts created before this change) see the map centered on New York, and there's no screen yet to change your neighborhood.
- Jobs run at least once, not exactly once. Handlers are written to be safe to repeat, but if the server dies between resolving a report and paying the fixer, the retry won't pay again. Closing that gap needs a MongoDB transaction (a replica set) or a points ledger.
- The app follows a photo check by polling the job every second. Pushing the result over the live-update stream would remove the polling.
- Live updates go through the server's memory, so they reach everyone only while the backend runs as a single instance. Scaling out would need a shared channel such as MongoDB change streams.
