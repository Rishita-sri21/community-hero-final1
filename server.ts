import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import app from './app';
import User from './models/User';
import connectDB from './config/db';
import Report from './models/Report';
import { seedDemoReports } from './services/reports';
import { startWorker } from './services/jobs';
import { log } from './services/logger';

const PORT = Number(process.env.PORT) || 3000;

// Fail fast with a clear message instead of crashing later with a confusing one.
function checkRequiredEnv() {
  const missing = ['MONGODB_URI', 'JWT_SECRET'].filter((key) => !process.env[key]);
  if (missing.length > 0) {
    log.error(`Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`);
    process.exit(1);
  }
  if (!process.env.GEMINI_API_KEY) {
    log.warn('GEMINI_API_KEY is not set. AI features will use their offline fallbacks.');
  }
}

async function seedDemoUsers() {
  const demoUsers = [
    {
      name: "Elena Rostova",
      email: "elena@example.com",
      password: "password123",
      role: "Organizer",
      points: 3100,
      district: "Manhattan (New York City, United States)",
      avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150"
    },
    {
      name: "Marcus Thompson",
      email: "marcus@example.com",
      password: "password123",
      role: "Civil Servant",
      points: 2450,
      district: "Manhattan (New York City, United States)",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150"
    },
    {
      name: "Samira Khan",
      email: "samira@example.com",
      password: "password123",
      role: "Volunteer",
      points: 1800,
      district: "Brooklyn (New York City, United States)",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150"
    },
    {
      name: "Sarah Johnson",
      email: "sarah@example.com",
      password: "password123",
      role: "Volunteer",
      points: 480,
      district: "Queens (New York City, United States)",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150"
    }
  ];

  for (const u of demoUsers) {
    const exists = await User.findOne({ email: u.email });

    if (!exists) {
      const hashed = await bcrypt.hash(u.password, 10);

      await User.create({
        ...u,
        password: hashed,
        joinedSquads: []
      });

      log.info("Created demo user:", u.email);
    }
  }
}

async function startServer() {
  checkRequiredEnv();

  try {
    await connectDB();
  } catch (err: any) {
    log.error('Could not connect to MongoDB. Check MONGODB_URI.', err.message);
    process.exit(1);
  }

  await seedDemoUsers();
  // Distance sorting needs the reports' 2dsphere index; wait until it exists before serving.
  // syncIndexes also drops indexes the schema no longer declares (the old location-only geo
  // index), since $geoNear refuses to run when two geo indexes could serve it.
  await Report.syncIndexes();
  await seedDemoReports();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    log.info(`Server running on port ${PORT}`);
  });

  // Runs queued background jobs (AI photo checks, report triage) in this process.
  // RUN_JOB_WORKER=false turns it off, e.g. for a web-only instance when a separate worker runs.
  const worker = process.env.RUN_JOB_WORKER === 'false' ? null : startWorker();
  if (worker) log.info(`Job worker ${worker.id} started`);

  // Hosts send SIGTERM before replacing the server during a deploy. Stop taking new
  // connections and jobs, let running jobs finish, close the database cleanly, and give up
  // after 10 seconds, since open live-update streams would otherwise keep the server alive.
  // A job cut off by the deadline isn't lost: its lease runs out and another worker retries it.
  const shutdown = (signal: string) => {
    log.info(`${signal} received, shutting down`);
    setTimeout(() => process.exit(0), 10_000).unref();
    const httpClosed = new Promise<void>((resolve) => server.close(() => resolve()));
    server.closeAllConnections?.();
    Promise.all([httpClosed, worker?.stop()]).finally(() => {
      mongoose.disconnect().finally(() => process.exit(0));
    });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

startServer();
