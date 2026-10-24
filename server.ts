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

const PORT = Number(process.env.PORT) || 3000;

// Fail fast with a clear message instead of crashing later with a confusing one.
function checkRequiredEnv() {
  const missing = ['MONGODB_URI', 'JWT_SECRET'].filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`);
    process.exit(1);
  }
  if (!process.env.GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY is not set. AI features will use their offline fallbacks.');
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

      console.log("Created demo user:", u.email);
    }
  }
}

async function startServer() {
  checkRequiredEnv();

  try {
    await connectDB();
  } catch (err: any) {
    console.error('Could not connect to MongoDB. Check MONGODB_URI.', err.message);
    process.exit(1);
  }

  await seedDemoUsers();
  // Distance sorting needs the reports' 2dsphere index; wait until it exists before serving
  await Report.init();
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
    console.log(`Server running on port ${PORT}`);
  });

  // Hosts send SIGTERM before replacing the server during a deploy. Stop taking new
  // connections, close the database cleanly, and give up after 10 seconds, since open
  // live-update streams would otherwise keep the server alive.
  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    setTimeout(() => process.exit(0), 10_000).unref();
    server.close(() => {
      mongoose.disconnect().finally(() => process.exit(0));
    });
    server.closeAllConnections?.();
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

startServer();
