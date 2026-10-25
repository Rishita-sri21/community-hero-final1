# Community Hero

A hyperlocal civic platform where residents report neighborhood problems (potholes, broken streetlights, leaks, waste), verify each other's reports on a live map, and prove fixes with a photo that an AI vision model checks. Contributions earn Hero Points that can be spent in a rewards store.

## Features

- **Map-based reporting:** click anywhere on an interactive Leaflet map to drop a report pin, optionally with a photo.
- **Your neighborhood first:** the map opens on the neighborhood you picked at sign-up, and reports are sorted by distance from it.
- **AI triage:** Google Gemini suggests a category and urgency for each new report.
- **Photo-verified resolution:** capture or upload a photo of the fix; Gemini Vision compares it with the reporter's "before" photo (when there is one) and judges whether the issue is resolved. Resolved reports are kept with their fix photo.
- **Live updates:** new reports, vote counts and resolutions appear for everyone as they happen, over Server-Sent Events.
- **Civic assistant:** a chat widget that knows the app and the current reports in your area.
- **Points and rewards:** earn points for reporting, verifying and resolving; spend them in the store. Every award and spend is decided and applied by the server (see [Points rules](#points-rules)).
- **Roles:** Volunteers, Civil Servants and Organizers; privileged roles get an admin console with audit logs.

## Architecture

```
Browser (React SPA, src/)
   │  all HTTP calls go through src/lib/api.ts (JSON + Bearer JWT)
   ▼
Express API (app.ts, started by server.ts)
   ├── MongoDB via Mongoose ─ users, reports (2dsphere geo index), audit logs
   ├── MongoDB GridFS ─────── report and fix photos, served at /api/images/:id
   ├── Google Gemini ──────── categorization, chat, photo verification (optional)
   └── GET /api/events ────── live updates pushed to every open browser (Server-Sent Events)
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
| Resolve a report with a verified photo | +150 | not your own report |
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
| `POST` | `/api/reports`, `/api/reports/:id/upvote`, `/api/reports/:id/verify`, `/api/reports/resolve` | required |
| `POST` | `/api/actions/green`, `/api/rewards/redeem` | required |
| `POST` | `/api/users/update-district`, `/join-squad`, `/leave-squad` | required |
| `GET` | `/api/leaderboard` | public |
| `POST` | `/api/assistant/chat` | public |
| `GET/POST` | `/api/admin/*` | Civil Servant or Organizer |
| `GET` | `/api/events` | public (Server-Sent Events: `report.created`, `report.updated`, `report.resolved`) |
| `GET` | `/api/health` | public (503 while the database is unreachable) |

## Known limitations

This project is being upgraded in stages. Current known gaps:

- Green actions are self-reported, so they're limited to once per action per day rather than proven.
- Missions, notifications and analytics are front-end demos without server persistence.
- Accounts whose district isn't one of the onboarding neighborhoods (older accounts, and demo accounts created before this change) see the map centered on New York, and there's no screen yet to change your neighborhood.
- Live updates go through the server's memory, so they reach everyone only while the backend runs as a single instance. Scaling out would need a shared channel such as MongoDB change streams.
