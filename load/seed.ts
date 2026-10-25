// Fills a database with realistic volumes for load testing: N open and resolved reports spread
// over Manhattan and Brooklyn, plus a load-test user. Run against a throwaway database only.
//
//   MONGODB_URI=mongodb://127.0.0.1:27017/community-hero-load npx tsx load/seed.ts 5000
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Report from '../models/Report';
import User from '../models/User';
import { CATEGORIES, URGENCIES, iconForCategory } from '../services/reports';

const COUNT = Number(process.argv[2] || 5000);
const TITLES: Record<string, string[]> = {
  Pothole: ['Deep pothole', 'Cracked asphalt', 'Sinking manhole cover'],
  Graffiti: ['Graffiti on wall', 'Tagged storefront', 'Spray paint on bench'],
  Streetlight: ['Streetlight out', 'Flickering lamp', 'Dark corner, light broken'],
  'Park Maintenance': ['Broken bench', 'Fallen branch on path', 'Damaged swing'],
  'Waste Management': ['Overflowing bins', 'Dumped mattress', 'Litter piling up'],
  'Water Leakage': ['Leaking hydrant', 'Burst pipe', 'Water pooling on sidewalk'],
};
const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri || !/load|test/.test(uri)) throw new Error('Set MONGODB_URI to a throwaway database whose name contains "load" or "test"');
  await mongoose.connect(uri);
  await Report.init();
  await Report.deleteMany({});

  const password = await bcrypt.hash('load-test-password', 10);
  await User.updateOne(
    { email: 'load@example.com' },
    { $set: { name: 'Load Tester', password, district: 'Manhattan (New York City, United States)' } },
    { upsert: true }
  );

  const now = Date.now();
  const docs = Array.from({ length: COUNT }, () => {
    const category = pick(CATEGORIES);
    const createdAt = new Date(now - Math.random() * 60 * 86_400_000);
    const resolved = Math.random() < 0.35;
    // Manhattan and Brooklyn, roughly 40.63-40.82 N, 74.02-73.92 W
    const lat = 40.63 + Math.random() * 0.19;
    const lng = -74.02 + Math.random() * 0.1;
    return {
      reporter: { name: 'Neighbor' },
      title: pick(TITLES[category]),
      description: `${pick(TITLES[category])} reported by a neighbor.`,
      category,
      urgency: pick(URGENCIES),
      district: 'Manhattan (New York City, United States)',
      location: { type: 'Point', coordinates: [lng, lat] },
      icon: iconForCategory(category),
      upvotes: Math.floor(Math.random() * 20),
      upvotedBy: [],
      verifiedBy: [],
      status: resolved ? 'resolved' : 'open',
      resolution: resolved ? { at: new Date(createdAt.getTime() + Math.random() * 10 * 86_400_000) } : undefined,
      createdAt,
      updatedAt: createdAt,
    };
  });
  for (let i = 0; i < docs.length; i += 1000) await Report.insertMany(docs.slice(i, i + 1000), { lean: true });
  console.log(`Seeded ${COUNT} reports (${docs.filter((d) => d.status === 'open').length} open) and load@example.com`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
