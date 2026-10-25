import express from 'express';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import User from './models/User';
import jwt from 'jsonwebtoken';
import { generateToken } from './utils/jwt';
import cors from 'cors';
import { protect } from './middleware/auth';
import { awardPoints, joinSquad, leaveSquad, logGreenAction, redeemReward } from './services/points';
import { POINTS, MAX_REWARDED_REPORTS_PER_DAY } from './src/shared/catalog';
import { centerForDistrict } from './src/shared/neighborhoods';
import Report from './models/Report';
import AuditLog from './models/AuditLog';
import { CATEGORIES, URGENCIES, iconForCategory, isValidObjectId, listOpenReports, listStories, timeAgo, toPublicReport } from './services/reports';
import { listenerCount, publish, streamEvents } from './services/events';
import Notification from './models/Notification';
import mongoose from 'mongoose';
import { getGenAI, GEMINI_MODEL, withTimeout, writeMissionBriefing } from './services/ai';
import { planMission } from './services/missions';
import { listSquads, userStats } from './services/squads';
import { listNotifications, markAllRead, notifyReporter } from './services/notifications';
import { neighborhoodAnalytics } from './services/analytics';
import { logAuditEvent } from './services/audit';
import Job, { type JobDoc } from './models/Job';
import { enqueue, queueStats, retryFailedJob, toPublicJob } from './services/jobs';
import { JOB_TYPES, registerJobHandlers } from './services/jobHandlers';
import { getVision } from './services/vision';
import { findImage, imageErrorMessage, parseDataUrlImage, saveDataUrlImage, storeImage } from './services/images';

// Load environment variables
dotenv.config();

const app = express();

// The background jobs this server can run (the worker itself is started by server.ts)
registerJobHandlers();

// Render, Vercel and most hosts put a proxy in front of the app. Trusting one proxy hop makes
// req.ip the visitor's address instead of the proxy's, so the login rate limit is per visitor
// rather than one shared limit for everybody.
app.set('trust proxy', 1);

// CORS_ORIGINS (comma-separated, e.g. https://my-app.vercel.app) limits which sites may call
// the API from a browser. Unset, any site may, which is fine for local development.
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins.length > 0 ? allowedOrigins : '*' }));

// Basic security headers for every response
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
  });
  next();
});

// Photos arrive as base64 inside JSON: a 3 MB photo is about 4 MB of text
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

// Sliding-window rate limiter for auth routes
const authAttempts: Record<string, { count: number; lastAttempt: number }> = {};
const RATE_LIMIT_MAX = 8;
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute window

// Forget addresses whose window has passed, so the table can't grow forever
setInterval(() => {
  const now = Date.now();
  for (const ip of Object.keys(authAttempts)) {
    if (now - authAttempts[ip].lastAttempt > RATE_LIMIT_WINDOW) delete authAttempts[ip];
  }
}, RATE_LIMIT_WINDOW).unref();

function rateLimitAuth(req: any, res: any, next: any) {
  const rawIp = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  const ip = Array.isArray(rawIp) ? rawIp[0] : rawIp;
  const now = Date.now();

  if (!authAttempts[ip]) {
    authAttempts[ip] = { count: 1, lastAttempt: now };
    return next();
  }

  const attempt = authAttempts[ip];
  if (now - attempt.lastAttempt > RATE_LIMIT_WINDOW) {
    attempt.count = 1;
    attempt.lastAttempt = now;
    return next();
  }

  attempt.count++;
  attempt.lastAttempt = now;
  if (attempt.count > RATE_LIMIT_MAX) {
    logAuditEvent('SECURITY_VIOLATION', `Rate limiting block triggered on Auth route. IP: ${ip}`, false, undefined, ip);
    return res.status(429).json({
      error: `Too many authentication requests. Please wait ${Math.ceil(RATE_LIMIT_WINDOW / 1000)} seconds to try again.`,
    });
  }

  next();
}

// Optional-auth middleware: if a valid token is present, attaches req.user (Mongoose doc).
// Does NOT block the request if the token is missing/invalid — routes that require
// auth use the `protect` middleware instead.
app.use(async (req: any, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);
      const user = await User.findById(decoded.id);

      if (user) {
        req.user = user;
      }
    } catch (err) {
      // Invalid/expired token on an optional route — just proceed unauthenticated.
    }
  }

  next();
});

function isValidCoordinate(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
}

function publicUser(userDoc: any) {
  const obj = userDoc.toObject ? userDoc.toObject() : userDoc;
  const { password, __v, ...profile } = obj;
  return profile;
}

// ==========================================
// API ROUTES
// ==========================================

// Authenticated User Registration
app.post('/api/auth/register', rateLimitAuth, async (req, res) => {
  try {
    // `role` is deliberately not read from the body: users must not be able to make themselves admins.
    const { name, email, password, avatar } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      logAuditEvent('AUTH_REGISTER', `Registration attempt for existing email: ${email}`, false, email, req.ip);
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      avatar: typeof avatar === 'string' && avatar.startsWith('https://') ? avatar : undefined,
    });

    const token = generateToken(String(user._id));

    logAuditEvent('AUTH_REGISTER', `New user registered: ${email}`, true, email, req.ip);

    res.json({
      token,
      user: publicUser(user),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', rateLimitAuth, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      logAuditEvent('AUTH_LOGIN', `Login attempt for unknown email: ${email}`, false, email, req.ip);
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      logAuditEvent('AUTH_LOGIN', `Failed login (bad password): ${email}`, false, email, req.ip);
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(String(user._id));

    logAuditEvent('AUTH_LOGIN', `User logged in: ${email}`, true, email, req.ip);

    res.json({
      token,
      user: publicUser(user),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Authenticated Session Checker
app.get('/api/auth/me', protect, (req: any, res) => {
  res.json(publicUser(req.user));
});

// Dynamic Leaderboard (computed live from MongoDB)
app.get('/api/leaderboard', async (req, res) => {
  try {
    const users = await User.find().sort({ points: -1 }).limit(50);
    const leaderboard = users.map((u, idx) => ({
      rank: idx + 1,
      name: u.name,
      avatar: u.avatar,
      points: u.points,
      userId: u._id,
    }));
    res.json(leaderboard);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

// Points can only change through these routes, and only by amounts the server decides.
// There is deliberately no "add N points" endpoint.

// Log a self-reported green action (each action once per day)
app.post('/api/actions/green', protect, async (req: any, res) => {
  try {
    const result = await logGreenAction(req.user._id, String(req.body.actionId || ''));
    if ('reason' in result) {
      return result.reason === 'unknown-action'
        ? res.status(400).json({ error: 'Unknown action' })
        : res.status(429).json({ error: 'You already logged this action today. Come back tomorrow!' });
    }
    logAuditEvent('POINTS_TRANSACTION', `Green action ${req.body.actionId} logged by ${req.user.email} (+${result.awarded})`, true, req.user.email, req.ip);
    res.json({ points: result.points, awarded: result.awarded });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to log action' });
  }
});

// Redeem a reward from the catalogue; the server decides the cost
app.post('/api/rewards/redeem', protect, async (req: any, res) => {
  try {
    const result = await redeemReward(req.user._id, String(req.body.rewardId || ''));
    if ('reason' in result) {
      return result.reason === 'unknown-reward'
        ? res.status(400).json({ error: 'Unknown reward' })
        : res.status(400).json({ error: 'You need more Hero Points to redeem this reward.' });
    }
    logAuditEvent('POINTS_TRANSACTION', `Reward ${req.body.rewardId} redeemed by ${req.user.email}`, true, req.user.email, req.ip);
    res.json({ points: result.points, code: result.code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to redeem reward' });
  }
});

// Update User District/Location Onboarding
app.post('/api/users/update-district', protect, async (req: any, res) => {
  try {
    const { district } = req.body;

    if (!district) {
      return res.status(400).json({ error: 'District is required' });
    }

    req.user.district = district;
    await req.user.save();

    res.json({ success: true, user: publicUser(req.user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update district' });
  }
});

// Join a squad (join bonus paid only the first time)
app.post('/api/users/join-squad', protect, async (req: any, res) => {
  try {
    const result = await joinSquad(req.user._id, String(req.body.squadId || ''));
    if ('reason' in result) {
      return res.status(400).json({ error: 'Unknown squad' });
    }
    res.json({ joinedSquads: result.joinedSquads, points: result.points, awarded: result.awarded });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to join squad' });
  }
});

app.post('/api/users/leave-squad', protect, async (req: any, res) => {
  try {
    const joinedSquads = await leaveSquad(req.user._id, String(req.body.squadId || ''));
    res.json({ joinedSquads });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to leave squad' });
  }
});

// Squads with member counts, open reports in their categories near the viewer, and fixes by members
app.get('/api/squads', protect, async (req: any, res) => {
  try {
    res.json(await listSquads(req.user, centerForDistrict(req.user.district)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load squads' });
  }
});

app.get('/api/users/me/stats', protect, async (req: any, res) => {
  try {
    res.json(await userStats(req.user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load your stats' });
  }
});

// Upvotes, verifications and fixes on the user's own reports
app.get('/api/notifications', protect, async (req: any, res) => {
  try {
    res.json(await listNotifications(req.user._id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

app.post('/api/notifications/read', protect, async (req: any, res) => {
  try {
    await markAllRead(req.user._id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

// Liveness check for hosting platforms and uptime monitors
// Used by the host's health check: unhealthy (503) while the database is unreachable
app.get('/api/health', (req, res) => {
  const database = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(database === 'connected' ? 200 : 503).json({ status: database === 'connected' ? 'ok' : 'degraded', database });
});

// Live updates: new reports, vote counts and resolutions, as Server-Sent Events
app.get('/api/events', (req, res) => {
  streamEvents(res);
});

function startOfToday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Missions only consider open reports within this distance of the start
const MISSION_SEARCH_RADIUS_KM = 20;

// Reads ?lat=&lng= from the query string, or undefined if they're missing or invalid
function nearFromQuery(query: any) {
  const lat = Number(query.lat);
  const lng = Number(query.lng);
  if (query.lat === undefined || query.lng === undefined) return undefined;
  if (!isValidCoordinate(lat, 90) || !isValidCoordinate(lng, 180)) return undefined;
  return { lat, lng };
}

// Open reports. With ?lat=&lng= they come nearest first, each with its distance in km.
app.get('/api/reports', async (req: any, res) => {
  try {
    const reports = await listOpenReports(nearFromQuery(req.query));
    res.json(reports.map((r: any) => toPublicReport(r, req.user, r.distanceMeters)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load reports' });
  }
});

// Serves an uploaded photo. Photos never change, so browsers may cache them for a long time.
app.get('/api/images/:id', async (req, res) => {
  try {
    const image = await findImage(req.params.id);
    if (!image) return res.status(404).json({ error: 'Image not found' });
    res.set({
      'Content-Type': image.contentType,
      'Content-Length': String(image.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    image.stream().on('error', () => res.end()).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load image' });
  }
});

// Create a new report
app.post('/api/reports', protect, async (req: any, res) => {
  const reportData = req.body;

  if (typeof reportData.title !== 'string' || !reportData.title.trim() ||
      typeof reportData.description !== 'string' || !reportData.description.trim()) {
    return res.status(400).json({ error: 'Title and description are required' });
  }
  if (!isValidCoordinate(reportData.lat, 90) || !isValidCoordinate(reportData.lng, 180)) {
    return res.status(400).json({ error: 'Pick the location on the map' });
  }

  // An optional photo of the problem, sent as a data URL and stored in the database
  let image: string | undefined;
  if (reportData.image !== undefined && reportData.image !== null && reportData.image !== '') {
    if (typeof reportData.image !== 'string') {
      return res.status(400).json({ error: 'The photo could not be read' });
    }
    const saved = await saveDataUrlImage(reportData.image, req.user._id);
    if (saved.ok === false) return res.status(400).json({ error: imageErrorMessage(saved.reason) });
    image = saved.url;
  }

  // "auto" (or nothing) leaves the field to the background triage job, which fills it in
  // a moment later; until then the report shows a placeholder value
  const autoFields: Array<'category' | 'urgency'> = [];
  let category = reportData.category;
  if (!CATEGORIES.includes(category)) {
    autoFields.push('category');
    category = 'General';
  }
  let urgency = reportData.urgency;
  if (!URGENCIES.includes(urgency)) {
    autoFields.push('urgency');
    urgency = 'Medium';
  }

  const userId = req.user._id;
  const reportsToday = await Report.countDocuments({ 'reporter.id': userId, createdAt: { $gte: startOfToday() } });

  const report = await Report.create({
    reporter: { id: userId, name: req.user.name, avatar: req.user.avatar },
    title: reportData.title.trim(),
    description: reportData.description.trim(),
    category,
    urgency,
    district: typeof reportData.district === 'string' ? reportData.district : req.user.district,
    locationDetails: typeof reportData.locationDetails === 'string' ? reportData.locationDetails : undefined,
    location: { type: 'Point', coordinates: [reportData.lng, reportData.lat] },
    icon: iconForCategory(category),
    image,
    triage: { status: 'pending', autoFields },
  });

  // Category and urgency from the photo and text, in the background, so posting stays fast.
  // If queueing fails the report still stands, with the reporter's own choices.
  enqueue(JOB_TYPES.TRIAGE_REPORT, { reportId: String(report._id) }, { createdBy: userId }).catch((err) => {
    console.error(`Could not queue triage for report ${report._id}:`, err);
  });

  logAuditEvent('REPORT_CREATED', `Report ${report._id} created by ${req.user.email}`, true, req.user.email, req.ip);

  // Points are capped per day so mass-posting reports can't farm them
  let updatedPoints: number | null = null;
  if (reportsToday < MAX_REWARDED_REPORTS_PER_DAY) {
    updatedPoints = await awardPoints(userId, POINTS.REPORT_CREATED);
  }

  const publicReport = toPublicReport(report, req.user);
  publish({ type: 'report.created', report: publicReport });
  res.status(201).json({ report: publicReport, points: updatedPoints });
});

// Upvote and verify share their rules: once per person, never on your own report.
// The conditions are part of the update itself, so two requests at once can't both count.
async function voteOnReport(req: any, res: any, kind: 'upvote' | 'verify') {
  const userId = req.user._id;
  const field = kind === 'upvote' ? 'upvotedBy' : 'verifiedBy';

  const update = kind === 'upvote'
    ? { $addToSet: { upvotedBy: userId }, $inc: { upvotes: 1 } }
    : { $addToSet: { verifiedBy: userId }, $set: { verified: true } };

  const report = isValidObjectId(req.params.id)
    ? await Report.findOneAndUpdate(
        { _id: req.params.id, status: 'open', 'reporter.id': { $ne: userId }, [field]: { $ne: userId } },
        update,
        { returnDocument: 'after' }
      )
    : null;

  if (!report) {
    // Work out which rule stopped it, to give a useful error
    const existing = isValidObjectId(req.params.id) ? await Report.findById(req.params.id) : null;
    if (!existing || existing.status !== 'open') return res.status(404).json({ error: 'Report not found' });
    if (String(existing.reporter?.id) === String(userId)) {
      return res.status(403).json({ error: `You can't ${kind} your own report` });
    }
    return res.status(409).json({ error: `You already ${kind === 'upvote' ? 'upvoted' : 'verified'} this report` });
  }

  if (kind === 'verify') {
    logAuditEvent('REPORT_VERIFIED', `Report ${report._id} verified by ${req.user.email}`, true, req.user.email, req.ip);
  }
  notifyReporter(kind, report, req.user);
  const points = await awardPoints(userId, kind === 'upvote' ? POINTS.REPORT_UPVOTED : POINTS.REPORT_VERIFIED);
  const publicReport = toPublicReport(report, req.user);
  publish({ type: 'report.updated', report: publicReport });
  res.json({ report: publicReport, points });
}

app.post('/api/reports/:id/upvote', protect, (req, res) => voteOnReport(req, res, 'upvote'));
app.post('/api/reports/:id/verify', protect, (req, res) => voteOnReport(req, res, 'verify'));

// AI Assistant Chat endpoint
// The assistant answers from the real reports near the user, which the server looks up itself.
// Without a Gemini key it says so instead of replying with canned text.
app.post('/api/assistant/chat', protect, async (req: any, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40 ||
      !messages.every((m: any) => typeof m?.text === 'string' && m.text.length <= 2000)) {
    return res.status(400).json({ error: 'Invalid message structure' });
  }

  const ai = getGenAI();
  if (!ai) {
    return res.status(503).json({ error: 'The assistant is unavailable: this server has no Gemini API key configured.' });
  }

  const district: string | undefined = req.user.district;
  const nearby = await listOpenReports(centerForDistrict(district), 10);
  const reportLines = nearby.map((r: any) =>
    `- [${r.category}, ${r.urgency} urgency] "${r.title}", ${(r.distanceMeters / 1000).toFixed(1)} km away, ${r.upvotes} upvotes, reported ${timeAgo(r.createdAt)}`
  ).join('\n');

  const systemInstruction = `You are the assistant inside Community Hero, an app where residents report local problems
(potholes, broken streetlights, graffiti, waste, leaks, park damage), and neighbors upvote, verify and fix them.
How the app works, which you may explain:
- Click the map to report an issue at an exact spot, optionally with a photo (+${POINTS.REPORT_CREATED} points, up to ${MAX_REWARDED_REPORTS_PER_DAY} rewarded reports a day).
- Upvote (+${POINTS.REPORT_UPVOTED} to the reporter) or verify (+${POINTS.REPORT_VERIFIED}) other people's reports.
- Resolve a report by uploading a photo of the fix. Gemini compares it with the original photo; a verified fix earns +${POINTS.REPORT_RESOLVED}, except on your own reports.
- The Mission Planner builds a walking route through the highest-priority open reports nearby.
- Points can be spent in the Rewards tab.
The user's neighborhood: ${district || 'not set'}.
Open reports nearest to them, from the database right now:
${reportLines || '(none)'}
Only state facts from this message. If you don't know something, say so. Keep answers short and practical.`;

  try {
    const history = messages.slice(0, -1).map((m: any) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.text }],
    }));
    // Gemini expects the conversation to start with the user; drop the widget's greeting
    while (history.length > 0 && history[0].role === 'model') history.shift();
    const chat = ai.chats.create({ model: GEMINI_MODEL, config: { systemInstruction }, history });
    const response = await withTimeout(chat.sendMessage({ message: messages[messages.length - 1].text }), 20000);
    return res.json({ text: response.text });
  } catch (err) {
    console.error('Gemini chat error:', err);
    return res.status(502).json({ error: 'The assistant could not answer right now. Please try again.' });
  }
});

// Plans a walking route through the open reports most worth visiting near ?lat=&lng=.
// The route is computed by services/missions.ts; Gemini only writes the short briefing, when configured.
app.get('/api/missions/plan', protect, async (req: any, res) => {
  const start = nearFromQuery(req.query);
  if (!start) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }
  try {
    const candidates = await Report.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [start.lng, start.lat] },
          distanceField: 'distanceMeters',
          maxDistance: MISSION_SEARCH_RADIUS_KM * 1000,
          query: { status: 'open' },
          spherical: true,
        },
      },
      { $limit: 200 },
      {
        $project: {
          title: 1, category: 1, urgency: 1, upvotes: 1, createdAt: 1, location: 1,
          verifications: { $size: '$verifiedBy' },
        },
      },
    ]);

    const mission = planMission(
      candidates.map((r: any) => ({
        id: String(r._id),
        title: r.title,
        category: r.category,
        urgency: r.urgency,
        upvotes: r.upvotes,
        verifications: r.verifications,
        createdAt: r.createdAt,
        lng: r.location.coordinates[0],
        lat: r.location.coordinates[1],
      })),
      start
    );
    if (!mission) {
      return res.json({ mission: null, searchRadiusKm: MISSION_SEARCH_RADIUS_KM });
    }

    const briefing = await writeMissionBriefing(mission, req.user.district);
    res.json({ mission: { ...mission, ...briefing, start }, searchRadiusKm: MISSION_SEARCH_RADIUS_KM });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to plan a mission' });
  }
});

// Recently resolved reports, with the reporter's photo and the fix photo
app.get('/api/stories', async (req, res) => {
  try {
    res.json(await listStories());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load stories' });
  }
});

// Neighborhood statistics around ?lat=&lng=, computed from stored reports
app.get('/api/analytics', async (req: any, res) => {
  const center = nearFromQuery(req.query);
  if (!center) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }
  try {
    res.json(await neighborhoodAnalytics(center));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

// Submits a photo of a fix. The photo is checked in the background (job "verify-fix"), so this
// answers 202 at once with a job id; the app polls GET /api/jobs/:id for the outcome.
app.post('/api/reports/resolve', protect, async (req: any, res) => {
  const { reportId, image } = req.body;

  if (!reportId || typeof image !== 'string' || !image) {
    return res.status(400).json({ error: 'Missing reportId or image' });
  }
  const photo = parseDataUrlImage(image);
  if (photo.ok === false) {
    return res.status(400).json({ success: false, message: imageErrorMessage(photo.reason) });
  }

  const report = isValidObjectId(reportId) ? await Report.findById(reportId).select('status').lean() : null;
  if (!report || report.status !== 'open') {
    return res.status(404).json({ error: 'Report not found' });
  }
  // Without Gemini the photo can't be checked, so we refuse rather than pretend
  // (unless SIMULATE_AI_VERIFICATION=true, for demos)
  if (!getVision().checkFix) {
    return res.status(503).json({ success: false, message: 'Photo verification is unavailable right now. Please try again later.' });
  }

  try {
    // The job gets a reference to the stored photo, not the photo itself, so jobs stay small
    const photoUrl = await storeImage(photo, req.user._id);
    const job = await enqueue(
      JOB_TYPES.VERIFY_FIX,
      { reportId: String(report._id), userId: String(req.user._id), photoUrl },
      { createdBy: req.user._id }
    );
    res.status(202).json({ job: toPublicJob(job) });
  } catch (err) {
    console.error('Could not queue the photo check:', err);
    res.status(500).json({ success: false, message: 'Could not submit the photo. Please try again.' });
  }
});

const isAdmin = (user: any) => user?.role === 'Organizer' || user?.role === 'Civil Servant';

// The status of a background job, for the person who started it (or an admin)
app.get('/api/jobs/:id', protect, async (req: any, res) => {
  const job = isValidObjectId(req.params.id) ? await Job.findById(req.params.id).lean<JobDoc>() : null;
  if (!job || (String(job.createdBy) !== String(req.user._id) && !isAdmin(req.user))) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(toPublicJob(job));
});

// ==========================================
// ADMINISTRATIVE & DATABASE MANAGEMENT ENDPOINTS
// ==========================================

// Secure endpoint: Get system audit logs (Civil Servants & Organizers only)
app.get('/api/admin/audit-logs', async (req: any, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized credentials session' });
  }
  if (req.user.role !== 'Organizer' && req.user.role !== 'Civil Servant') {
    logAuditEvent('SECURITY_VIOLATION', `Forbidden access to audit logs by ${req.user.email}`, false, req.user.email, req.ip);
    return res.status(403).json({ error: 'Forbidden: Requires elevated privileges.' });
  }
  try {
    const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(250).lean();
    res.json(logs.map(({ _id, __v, ...log }: any) => ({ id: String(_id), ...log })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load audit logs' });
  }
});

// Secure endpoint: Get database status and sizes
app.get('/api/admin/db/status', async (req: any, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized credentials session' });
  }
  if (req.user.role !== 'Organizer' && req.user.role !== 'Civil Servant') {
    logAuditEvent('SECURITY_VIOLATION', `Forbidden access to db metadata by ${req.user.email}`, false, req.user.email, req.ip);
    return res.status(403).json({ error: 'Forbidden: Requires elevated privileges.' });
  }

  try {
    const db = mongoose.connection.db!;
    // Round trip to the database, measured from this server
    const pingStart = process.hrtime.bigint();
    await db.admin().ping();
    const pingMs = Number(process.hrtime.bigint() - pingStart) / 1e6;

    const [build, stats, usersCount, openCount, resolvedCount, auditLogsCount, notificationsCount, jobsCount, lastExport] = await Promise.all([
      db.admin().command({ buildInfo: 1 }).catch(() => null),
      db.stats(),
      User.countDocuments(),
      Report.countDocuments({ status: 'open' }),
      Report.countDocuments({ status: 'resolved' }),
      AuditLog.countDocuments(),
      Notification.countDocuments(),
      Job.countDocuments(),
      AuditLog.findOne({ event: 'DB_EXPORT' }).sort({ timestamp: -1 }).lean(),
    ]);

    res.json({
      engine: 'MongoDB',
      version: build?.version ?? null,
      pingMs: Math.round(pingMs * 10) / 10,
      dataSizeBytes: stats.dataSize,
      storageSizeBytes: stats.storageSize,
      indexSizeBytes: stats.indexSize,
      uptimeSeconds: Math.round(process.uptime()),
      liveConnections: listenerCount(),
      collections: [
        { name: 'users', documents: usersCount, note: 'passwords hashed with bcrypt (cost 10)' },
        { name: 'reports', documents: openCount + resolvedCount, note: `${openCount} open, ${resolvedCount} resolved; 2dsphere index` },
        { name: 'auditlogs', documents: auditLogsCount, note: 'expire after 90 days' },
        { name: 'notifications', documents: notificationsCount, note: 'expire after 60 days' },
        { name: 'jobs', documents: jobsCount, note: 'background work queue; finished jobs expire after 7 days' },
      ],
      lastExport: lastExport ? { at: lastExport.timestamp, by: lastExport.userEmail, message: lastExport.message } : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load database status' });
  }
});

// Background job queue: backlog, timings and recent failures
app.get('/api/admin/jobs', async (req: any, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized credentials session' });
  }
  if (!isAdmin(req.user)) {
    logAuditEvent('SECURITY_VIOLATION', `Forbidden access to job queue by ${req.user.email}`, false, req.user.email, req.ip);
    return res.status(403).json({ error: 'Forbidden: Requires elevated privileges.' });
  }
  try {
    res.json(await queueStats());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load the job queue' });
  }
});

// Gives a failed job a fresh set of attempts, e.g. after an AI outage is over
app.post('/api/admin/jobs/:id/retry', async (req: any, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized credentials session' });
  }
  if (!isAdmin(req.user)) {
    logAuditEvent('SECURITY_VIOLATION', `Forbidden job retry by ${req.user.email}`, false, req.user.email, req.ip);
    return res.status(403).json({ error: 'Forbidden: Requires elevated privileges.' });
  }
  const job = isValidObjectId(req.params.id) ? await retryFailedJob(req.params.id) : null;
  if (!job) {
    return res.status(404).json({ error: 'No failed job with that id' });
  }
  logAuditEvent('JOB_RETRIED', `Job ${job._id} (${job.type}) retried by ${req.user.email}`, true, req.user.email, req.ip);
  res.json(toPublicJob(job));
});

// Downloads a collection as NDJSON (one JSON document per line), streamed from a MongoDB
// cursor so memory use stays flat however large the collection is. Passwords are never included.
const EXPORTS: Record<string, { model: mongoose.Model<any>; select: string }> = {
  reports: { model: Report, select: '' },
  users: { model: User, select: '-password' },
  auditlogs: { model: AuditLog, select: '' },
};

app.get('/api/admin/export/:collection', async (req: any, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized credentials session' });
  }
  if (req.user.role !== 'Organizer' && req.user.role !== 'Civil Servant') {
    logAuditEvent('SECURITY_VIOLATION', `Forbidden data export attempt by ${req.user.email}`, false, req.user.email, req.ip);
    return res.status(403).json({ error: 'Forbidden: Requires elevated privileges.' });
  }
  const target = EXPORTS[req.params.collection];
  if (!target) {
    return res.status(404).json({ error: 'Unknown collection' });
  }

  const date = new Date().toISOString().slice(0, 10);
  res.set({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Content-Disposition': `attachment; filename="community-hero-${req.params.collection}-${date}.ndjson"`,
  });

  let count = 0;
  try {
    const cursor = target.model.find().select(target.select).lean().cursor();
    for await (const doc of cursor) {
      // Respect backpressure: wait for the socket to drain before writing more
      if (!res.write(JSON.stringify(doc) + '\n')) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
      count++;
    }
    res.end();
    logAuditEvent('DB_EXPORT', `Exported ${count} ${req.params.collection} documents`, true, req.user.email, req.ip);
  } catch (err) {
    console.error('Export failed:', err);
    res.destroy(err as Error); // a cut-off download is better than a file that looks complete
  }
});

export default app;
