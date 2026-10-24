# Community Hero

A hyperlocal civic platform where residents report neighborhood problems (potholes, broken streetlights, leaks, waste), verify each other's reports on a live map, and prove fixes with a photo that an AI vision model checks. Contributions earn Hero Points that can be spent in a rewards store.

## Features

- **Map-based reporting:** click anywhere on an interactive Leaflet map to drop a report pin.
- **AI triage:** Google Gemini suggests a category and urgency for each new report.
- **Photo-verified resolution:** capture or upload a photo of the fix; Gemini Vision judges whether the issue is resolved.
- **Civic assistant:** a chat widget that knows the app and the current reports in your area.
- **Points and rewards:** earn points for reporting, verifying and resolving; spend them in the store.
- **Roles:** Volunteers, Civil Servants and Organizers; privileged roles get an admin console with audit logs.

## Architecture

```
Browser (React SPA, src/)
   │  all HTTP calls go through src/lib/api.ts (JSON + Bearer JWT)
   ▼
Express API (app.ts, started by server.ts)
   ├── MongoDB via Mongoose ─ users, roles, points
   ├── JSON files on disk ─── reports, audit logs
   └── Google Gemini ──────── categorization, chat, photo verification (optional)
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

On first start the server creates four demo accounts, all with the password `password123`: `elena@example.com` (Organizer), `marcus@example.com` (Civil Servant), `samira@example.com` and `sarah@example.com` (Volunteers).

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | yes | MongoDB connection string |
| `JWT_SECRET` | yes | Secret used to sign login tokens |
| `GEMINI_API_KEY` | no | Enables AI features; without it they use offline fallbacks |
| `VITE_API_URL` | no | API base URL for the frontend; defaults to same-origin in dev and the deployed backend in production builds |
| `PORT` | no | Server port, default `3000` |
| `DATA_DIR` | no | Folder for `reports-db.json` and `audit-logs-db.json` |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the API + frontend with hot reload |
| `npm run lint` | Type-check the whole project with `tsc` |
| `npm test` | Run the API and client tests (no database needed) |
| `npm run build` | Build the frontend to `dist/` and bundle the server to `dist/server.cjs` |
| `npm start` | Start the server (set `NODE_ENV=production` to serve `dist/`) |

CI runs type-check, tests and build on every pull request.

## API overview

| Method | Path | Auth |
|---|---|---|
| `POST` | `/api/auth/register`, `/api/auth/login` | rate-limited |
| `GET` | `/api/auth/me` | required |
| `GET` | `/api/reports` | public |
| `POST` | `/api/reports` | optional (awards points when signed in) |
| `POST` | `/api/reports/:id/upvote`, `/api/reports/:id/verify` | optional |
| `POST` | `/api/reports/resolve` | optional |
| `POST` | `/api/users/add-points`, `/spend-points`, `/update-district`, `/join-squad` | required |
| `POST` | `/api/assistant/chat` | public |
| `GET/POST` | `/api/admin/*` | Civil Servant or Organizer |
| `GET` | `/api/health` | public |

## Known limitations

This project is being upgraded in stages. Current known gaps:

- Reports and audit logs are stored in JSON files, so they don't survive redeploys on hosts with ephemeral disks.
- `/api/users/add-points` trusts the amount sent by the client; points for some UI actions are still awarded client-side.
- When Gemini is unavailable, photo verification falls back to a simulated success.
- Squads, missions, notifications and analytics are front-end demos without server persistence.
- Routes that need MongoDB are not covered by automated tests yet.
