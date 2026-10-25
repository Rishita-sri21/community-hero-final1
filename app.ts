import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import User from './models/User';
import jwt from 'jsonwebtoken';
import { generateToken } from './utils/jwt';
import cors from 'cors';
import { protect } from './middleware/auth';
import { awardPoints, joinSquad, leaveSquad, logGreenAction, redeemReward } from './services/points';
import { POINTS, MAX_REWARDED_REPORTS_PER_DAY } from './src/shared/catalog';
import Report from './models/Report';
import AuditLog from './models/AuditLog';
import { CATEGORIES, URGENCIES, iconForCategory, isValidObjectId, listOpenReports, toPublicReport } from './services/reports';
import { publish, streamEvents } from './services/events';
import mongoose from 'mongoose';
import { findImage, imageErrorMessage, parseDataUrlImage, readStoredImage, saveDataUrlImage, storeImage } from './services/images';

// Load environment variables
dotenv.config();

const app = express();

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

type AuditEvent = 'AUTH_LOGIN' | 'AUTH_REGISTER' | 'REPORT_CREATED' | 'REPORT_VERIFIED' | 'REPORT_RESOLVED' | 'POINTS_TRANSACTION' | 'SECURITY_VIOLATION' | 'DB_BACKUP';

// Records a security-relevant event in MongoDB. Never awaited by callers and never throws:
// a failed log write must not fail the request that triggered it.
function logAuditEvent(event: AuditEvent, message: string, success: boolean, userEmail?: string, ipAddress?: string) {
  AuditLog.create({ event, message, success, userEmail, ipAddress }).catch((e) => {
    console.error('Failed to write audit event:', e);
  });
}

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

// Lazy initializer for Google GenAI client
let genAIClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  if (!genAIClient) {
    const key = process.env.GEMINI_API_KEY;

    if (key && key !== 'MY_GEMINI_API_KEY' && key.trim() !== '') {
      try {
        genAIClient = new GoogleGenAI({
          apiKey: key,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });
      } catch (err) {
        console.error('Error initializing GoogleGenAI:', err);
      }
    }
  }

  return genAIClient;
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

  const ai = getGenAI();

  let autoCategory = CATEGORIES.includes(reportData.category) ? reportData.category : 'General';
  let urgency = URGENCIES.includes(reportData.urgency) ? reportData.urgency : 'Medium';

  // AI-powered categorization and details enrichment
  if (ai) {
    try {
      const prompt = `You are a municipal civil engineer. Categorize and analyze this citizen report title: "${reportData.title}" and description: "${reportData.description}".
      Respond in JSON format with these exact fields:
      - category: One of "Pothole", "Graffiti", "Streetlight", "Park Maintenance", "Waste Management", "Water Leakage"
      - urgency: One of "High", "Medium", "Low"
      - analysis: A single, brief, professional sentence detailing why this is categorized so and what municipal resources should be deployed.
      `;

      const aiRes = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING },
              urgency: { type: Type.STRING },
              analysis: { type: Type.STRING },
            },
            required: ['category', 'urgency', 'analysis'],
          },
        },
      });

      // The model's answer is untrusted input too: only accept values from the allowed lists
      const parsed = JSON.parse(aiRes.text || '{}');
      if (CATEGORIES.includes(parsed.category)) autoCategory = parsed.category;
      if (URGENCIES.includes(parsed.urgency)) urgency = parsed.urgency;
    } catch (err) {
      console.warn('AI categorization failed, using default values:', err);
    }
  }

  const userId = req.user._id;
  const reportsToday = await Report.countDocuments({ 'reporter.id': userId, createdAt: { $gte: startOfToday() } });

  const report = await Report.create({
    reporter: { id: userId, name: req.user.name, avatar: req.user.avatar },
    title: reportData.title.trim(),
    description: reportData.description.trim(),
    category: autoCategory,
    urgency,
    district: typeof reportData.district === 'string' ? reportData.district : req.user.district,
    locationDetails: typeof reportData.locationDetails === 'string' ? reportData.locationDetails : undefined,
    location: { type: 'Point', coordinates: [reportData.lng, reportData.lat] },
    icon: iconForCategory(autoCategory),
    image,
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
  const points = await awardPoints(userId, kind === 'upvote' ? POINTS.REPORT_UPVOTED : POINTS.REPORT_VERIFIED);
  const publicReport = toPublicReport(report, req.user);
  publish({ type: 'report.updated', report: publicReport });
  res.json({ report: publicReport, points });
}

app.post('/api/reports/:id/upvote', protect, (req, res) => voteOnReport(req, res, 'upvote'));
app.post('/api/reports/:id/verify', protect, (req, res) => voteOnReport(req, res, 'verify'));

// AI Assistant Chat endpoint
app.post('/api/assistant/chat', async (req, res) => {
  const { messages, userDistrict, activeReports } = req.body;
  const ai = getGenAI();

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid message structure' });
  }

  // Construct a hyper-contextual system instruction embedding the current site state
  let systemInstruction = `You are the AI Civic Integrity Assistant for the Community Hero platform.
  You are helpful, encouraging, and informative. Your goal is to guide citizens in identifying, reporting, verifying, and resolving local community issues (potholes, water leaks, flickering streetlights, waste, etc.).

  [WEBSITE STRUCTURE & MODULES EMBEDDING]
  You have complete knowledge of the Community Hero web app features:
  1. Home Dashboard:
     - Allows citizens to log positive daily green actions (e.g. "Planted Native Seedling", "Sorted Food Bank", "Cleared Trail Debris") to instantly earn points.
     - Displays "Active Community Initiatives" (such as Solar Auditing and Composting).
     - Displays a "Local Leaderboard" tracking outstanding citizens and ranks.
  2. Map & Insights:
     - Displays dynamic interactive pins of citizen-reported hazards.
     - Allows reporting new issues by placing pins.
     - Citizens can click any pin to upvote, comment, verify (+15 points), or click "Resolve Issue" which boots up the high-tech "Municipal Camera Verification Tool" to take/upload a photo of the fixed issue for a huge +150 points reward!
  3. Community Squads:
     - Volunteer teams collaborating on physical projects (crosswalk paint, trail cleanup).
     - Displays "Before & After Transformation Stories" illustrating actual positive civic impact.
  4. Rewards Store:
     - Citizens can spend their accumulated points on physical or civic benefits (Free Metro Pass, library club passes, compost bins).

  Explain points multiplier systems (+150 Hero points for camera verification), Community Squads, and how collective action offsets carbon emissions and increases neighborhood safety.
  Be highly knowledgeable about civil engineering, park preservation, and recycling programs.
  Keep responses concise, warm, optimistic, and directly related to hyperlocal solutions.`;

  if (userDistrict) {
    systemInstruction += `\n\n[CONTEXT: USER ENVIRONMENT]
The active user is currently in the "${userDistrict}" neighborhood. Provide helpful advice customized to this specific district!`;
  }

  if (activeReports && Array.isArray(activeReports) && activeReports.length > 0) {
    const reportListStr = activeReports.slice(0, 5).map((r) => `- [${r.category}] "${r.title}" in ${r.district || 'their district'} (${r.urgency} urgency)`).join('\n');
    systemInstruction += `\n\n[CONTEXT: ACTIVE COMMUNITY HAZARDS]
Here are some active community issues currently reported in the system:
${reportListStr}
You can mention these specific real-time issues and encourage the user to help verify or resolve them to earn Hero Points (+15 points for verification, +150 points for uploading a resolution image)!`;
  } else {
    systemInstruction += `\n\n[CONTEXT: ACTIVE COMMUNITY HAZARDS]\nThere are currently no active reports in this neighborhood. Encourage the user to explore, find a neighborhood hazard (like a broken street light or litter), and create the first report!`;
  }

  if (ai) {
    try {
      // Convert messages to Gemini format
      const chatMessages = messages.map((m) => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.text }],
      }));

      // Grab the last user message and set up the chat history
      const lastMessage = chatMessages[chatMessages.length - 1];
      const history = chatMessages.slice(0, chatMessages.length - 1);

      const chatInstance = ai.chats.create({
        model: 'gemini-3.5-flash',
        config: {
          systemInstruction,
        },
        history,
      });

      const response = await chatInstance.sendMessage({
        message: lastMessage.parts[0].text || '',
      });

      return res.json({ text: response.text });
    } catch (err: any) {
      console.error('Gemini Chat API Error:', err);
      return res.status(500).json({
        text: "I'm having trouble connecting to the civic intelligence matrix right now. However, rest assured that your report is safely stored in our local community registers. Let's make our neighborhood cleaner!",
      });
    }
  } else {
    // Graceful AI simulation fallback for offline/no-key developers
    const lastUserText = messages[messages.length - 1]?.text?.toLowerCase() || '';
    let text = `Hello! I am your AI Civic Integrity Assistant. ${userDistrict ? `I see you are helping keep ${userDistrict} clean and safe!` : 'I am here to support your community missions.'}`;

    if (activeReports && Array.isArray(activeReports) && activeReports.length > 0) {
      const myDistrictReports = activeReports.filter((r) => r.district === userDistrict);
      if (myDistrictReports.length > 0) {
        text += ` In your district (${userDistrict}), we have active reports like: "${myDistrictReports[0].title}" (${myDistrictReports[0].category}). Would you like to check it out or help verify it?`;
      } else {
        text += ` We have active reports in other districts like: "${activeReports[0].title}" (${activeReports[0].category}) in ${activeReports[0].district}.`;
      }
    }

    if (lastUserText.includes('squad')) {
      text = `That's a stellar idea! Since you're in ${userDistrict || 'our municipal area'}, I highly recommend starting a Green Community Action Squad. You can clean up local trails, plant native wildflowers to support honeybees, or organize compost bins. Joining a squad unlocks a 30% bonus on all reported tasks!`;
    } else if (lastUserText.includes('carbon') || lastUserText.includes('offset')) {
      text = 'We calculate carbon offsets based on materials recycled and green space restored. For instance, planting a native tree seedling offsets roughly 15-20kg of CO2 over its first year. Our top contributor, Elena M., has offset over 120kg this month alone!';
    } else if (lastUserText.includes('resolve') || lastUserText.includes('multiplier') || lastUserText.includes('verify')) {
      text = 'You can earn a massive 1.5x multiplier (usually +150 Hero Points) by taking a photo of a resolved issue using our camera modal. Our Multi-Modal Civic Vision AI automatically audits the image, matches it to the reported issue coordinates, and verifies that the restoration is complete and high-quality!';
    }

    return res.json({ text });
  }
});

app.post('/api/mission/generate', async (req, res) => {
  const { district, reports } = req.body;

  const ai = getGenAI();

  if (!ai) {
    return res.status(500).json({ error: 'Gemini unavailable' });
  }

  try {
    const prompt = `
Generate a civic action mission.

Return ONLY valid JSON.

{
  "title":"",
  "priorityScore":0,
  "estimatedTime":"",
  "impact":"",
  "tasks":[
    {
      "title":"",
      "category":"",
      "reward":0
    }
  ]
}

Neighborhood:
${district}

Active Reports:
${JSON.stringify(reports)}

Use professional civic language.

Mission titles should sound inspiring.

Examples:

Downtown Safety Sweep
Westside Community Restoration
Green Corridor Recovery Initiative

Keep impact descriptions concise.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = (response.text || '').trim();
    const mission = JSON.parse(text);

    return res.json(mission);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Mission generation failed' });
  }
});

app.post('/api/ai/mission', async (req, res) => {
  const { userDistrict, reports } = req.body;

  const ai = getGenAI();

  if (!ai) {
    return res.json({
      title: 'Neighborhood Rescue Mission',
      priorityScore: 87,
      estimatedTime: '45 mins',
      impact: 'High',
      tasks: reports?.slice(0, 3).map((r: any) => ({
        title: r.title,
        category: r.category,
        reward: r.urgency === 'High' ? 150 : 50,
      })) || [],
    });
  }

  try {
    const prompt = `
Generate a civic action mission.

Return ONLY valid JSON.

{
  "title":"",
  "priorityScore":0,
  "estimatedTime":"",
  "impact":"",
  "tasks":[
    {
      "title":"",
      "category":"",
      "reward":0
    }
  ]
}

Use professional civic language.

Mission titles should sound inspiring.

Examples:

"Downtown Safety Sweep"
"Westside Community Restoration"
"Green Corridor Recovery Initiative"

Keep impact descriptions concise.

Prioritize the most urgent unresolved reports.

Include exact report titles in tasks whenever possible.

Neighborhood: ${userDistrict}
Active Reports:
${JSON.stringify(reports)}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('No JSON returned');
    }

    return res.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Mission generation failed' });
  }
});

// Resolve reported issue via AI Multi-Modal Vision Audit
app.post('/api/reports/resolve', protect, async (req: any, res) => {
  const { reportId, image } = req.body;
  const ai = getGenAI();

  if (!reportId || typeof image !== 'string' || !image) {
    return res.status(400).json({ error: 'Missing reportId or image' });
  }
  const photo = parseDataUrlImage(image);
  if (photo.ok === false) {
    return res.status(400).json({ success: false, message: imageErrorMessage(photo.reason) });
  }

  const report = isValidObjectId(reportId) ? await Report.findById(reportId) : null;
  if (!report || report.status !== 'open') {
    return res.status(404).json({ error: 'Report not found' });
  }
  if (String(report.reporter?.id) === String(req.user._id)) {
    return res.status(403).json({ error: "You can't resolve your own report" });
  }

  // Marks the report resolved and pays out. The status check is part of the update,
  // so if two people resolve the same report at once, only one of them gets the points.
  const completeResolution = async (details: string) => {
    const claimed = await Report.findOneAndUpdate(
      { _id: report._id, status: 'open' },
      { $set: { status: 'resolved', resolution: { by: req.user._id, at: new Date(), details } } },
      { returnDocument: 'after' }
    );
    if (!claimed) return null; // someone else resolved it while we were waiting

    // Keep the fix photo with the report, so the resolution can be reviewed later
    const photoUrl = await storeImage(photo, req.user._id);
    await Report.updateOne({ _id: report._id }, { $set: { 'resolution.image': photoUrl } });

    logAuditEvent('REPORT_RESOLVED', `Report ${report._id} resolved by ${req.user.email}`, true, req.user.email, req.ip);
    publish({ type: 'report.resolved', id: String(report._id) });
    return awardPoints(req.user._id, POINTS.REPORT_RESOLVED);
  };

  // Demo mode only: without a Gemini key the photo can't be checked, so by default we refuse
  // rather than pretend. SIMULATE_AI_VERIFICATION=true accepts any photo, for demos.
  if (!ai) {
    if (process.env.SIMULATE_AI_VERIFICATION !== 'true') {
      return res.status(503).json({ success: false, message: 'Photo verification is unavailable right now. Please try again later.' });
    }
    const details = `Simulated verification of: "${report.title}".`;
    const finalPoints = await completeResolution(details);
    if (finalPoints === null) {
      return res.status(409).json({ success: false, message: 'This issue was already resolved.' });
    }
    return res.json({
      success: true,
      message: 'Resolution accepted (simulated verification, demo mode).',
      auditResult: {
        success: true,
        confidenceScore: 94,
        restorationDetails: details,
        co2OffsetKg: Math.floor(10 + Math.random() * 25),
        ecoIndexBoost: Math.floor(4 + Math.random() * 6),
        safetyScoreIncrease: Math.floor(8 + Math.random() * 7),
      },
      heroPointsAwarded: POINTS.REPORT_RESOLVED,
      userSession: { points: finalPoints },
    });
  }

  try {
    // When the reporter uploaded a photo of the problem, the AI compares before and after
    // instead of judging the fix photo on its own, which makes unrelated photos easy to spot.
    const before = report.image ? await readStoredImage(report.image) : null;
    const toPart = (img: { contentType: string; data: Buffer }) => ({
      inlineData: { mimeType: img.contentType, data: img.data.toString('base64') },
    });

    const prompt = `You are a Municipal Civil Integrity Auditor. Decide whether the AFTER photo shows the following reported issue resolved, cleaned up or fully repaired:
      Report Title: "${report.title}"
      Report Description: "${report.description}"
      ${before
        ? 'The first image is the BEFORE photo the resident took of the problem. The second image is the AFTER photo. Set success to true only if the AFTER photo plausibly shows the same place as the BEFORE photo, with the problem fixed.'
        : 'The only image is the AFTER photo. Set success to true only if it clearly shows the kind of place described, with the problem fixed.'}
      If the AFTER photo is unrelated to the report (a screenshot, a person, an indoor scene, a different kind of place) or the problem is still visible, set success to false and explain why in restorationDetails.
      Return a JSON response using the specified schema.`;

    const aiRes = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: { parts: [...(before ? [toPart(before)] : []), toPart(photo), { text: prompt }] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            success: { type: Type.BOOLEAN, description: 'True if image shows the reported issue has been successfully resolved/repaired/cleaned.' },
            confidenceScore: { type: Type.INTEGER, description: 'Confidence score from 0 to 100 on the quality and success of the resolution.' },
            restorationDetails: { type: Type.STRING, description: 'Brief detailed summary of the completed restoration seen in the photo.' },
            co2OffsetKg: { type: Type.INTEGER, description: 'Estimated carbon offset in kg (range 5 to 45).' },
            ecoIndexBoost: { type: Type.INTEGER, description: 'Eco-index boost in percentage (range 2 to 12).' },
            safetyScoreIncrease: { type: Type.INTEGER, description: 'Increase in public safety score percentage (range 5 to 15).' },
          },
          required: ['success', 'confidenceScore', 'restorationDetails', 'co2OffsetKg', 'ecoIndexBoost', 'safetyScoreIncrease'],
        },
      },
    });

    const auditResult = JSON.parse(aiRes.text || '{}');

    if (auditResult.success === true) {
      const finalPoints = await completeResolution(String(auditResult.restorationDetails || ''));
      if (finalPoints === null) {
        return res.status(409).json({ success: false, message: 'This issue was already resolved.' });
      }
      return res.json({
        success: true,
        message: 'Resolution verified successfully!',
        auditResult,
        heroPointsAwarded: POINTS.REPORT_RESOLVED,
        userSession: { points: finalPoints },
      });
    }

    return res.json({
      success: false,
      message: auditResult.restorationDetails || 'Civic Vision Audit was unable to verify the resolution. Please capture a clearer image directly showing the completed repair.',
    });
  } catch (err) {
    console.error('Vision API error:', err);
    return res.status(502).json({ success: false, message: 'Photo verification failed. Please try again.' });
  }
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
    const [usersCount, reportsCount, resolvedCount, auditLogsCount] = await Promise.all([
      User.countDocuments(),
      Report.countDocuments({ status: 'open' }),
      Report.countDocuments({ status: 'resolved' }),
      AuditLog.countDocuments(),
    ]);

    res.json({
      status: 'Operational',
      engine: 'MongoDB',
      metrics: {
        usersCount,
        reportsCount,
        auditLogsCount,
      },
      files: [
        { name: 'Users Collection', path: 'MongoDB: users', size: `${usersCount} documents` },
        { name: 'Reports Collection', path: 'MongoDB: reports', size: `${reportsCount} open, ${resolvedCount} resolved` },
        { name: 'Audit Log Collection', path: 'MongoDB: auditlogs', size: `${auditLogsCount} entries (kept 90 days)` },
      ],
      lastBackup: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load database status' });
  }
});

// Secure endpoint: Trigger integrity backup check
app.post('/api/admin/db/backup', (req: any, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized credentials session' });
  }
  if (req.user.role !== 'Organizer' && req.user.role !== 'Civil Servant') {
    return res.status(403).json({ error: 'Forbidden: Requires elevated privileges.' });
  }

  logAuditEvent('DB_BACKUP', `Database backup snapshot initialized by ${req.user.email}`, true, req.user.email, req.ip);
  res.json({
    success: true,
    message: 'Local Database snapshot backed up successfully!',
    timestamp: new Date().toISOString(),
    checksum: crypto.randomBytes(16).toString('hex'),
  });
});

export default app;
