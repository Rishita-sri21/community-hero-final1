import mongoose from 'mongoose';
import Report from '../models/Report';
import User from '../models/User';
import type { Report as PublicReport } from '../src/types';

export const CATEGORIES = ['Pothole', 'Graffiti', 'Streetlight', 'Park Maintenance', 'Waste Management', 'Water Leakage'];
export const URGENCIES = ['High', 'Medium', 'Low'];

export function iconForCategory(category: string) {
  if (category === 'Pothole') return 'warning';
  if (category === 'Streetlight') return 'lightbulb';
  return 'potted_plant';
}

export function timeAgo(date: Date, now = new Date()) {
  const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  const units: [string, number][] = [['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, size] of units) {
    const n = Math.floor(seconds / size);
    if (n >= 1) return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  }
  return 'Just now';
}

function isOwner(report: any, user: any) {
  return !!user && !!report.reporter?.id && String(report.reporter.id) === String(user._id);
}

/** Shapes a stored report for the API: hides who voted and adds flags for the current viewer. */
export function toPublicReport(report: any, user?: any, distanceMeters?: number): PublicReport {
  const userId = user ? String(user._id) : null;
  const [lng, lat] = report.location.coordinates;
  return {
    id: String(report._id),
    reporter: { name: report.reporter?.name || 'Neighbor', avatar: report.reporter?.avatar },
    timeAgo: timeAgo(report.createdAt),
    createdAt: report.createdAt.toISOString(),
    district: report.district,
    urgency: report.urgency,
    category: report.category,
    title: report.title,
    description: report.description,
    upvotes: report.upvotes,
    comments: report.comments,
    verified: report.verified,
    lat,
    lng,
    icon: report.icon,
    image: report.image,
    locationDetails: report.locationDetails,
    distanceKm: distanceMeters === undefined ? undefined : Math.round(distanceMeters / 100) / 10,
    isMine: isOwner(report, user),
    hasUpvoted: userId ? report.upvotedBy.some((id: unknown) => String(id) === userId) : false,
    hasVerified: userId ? report.verifiedBy.some((id: unknown) => String(id) === userId) : false,
  };
}

/** Open reports, nearest first when a location is given, otherwise newest first. */
export async function listOpenReports(near?: { lat: number; lng: number }, limit = 200) {
  if (near) {
    // $geoNear must be the first pipeline stage; it uses the 2dsphere index and adds the distance
    return Report.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [near.lng, near.lat] },
          distanceField: 'distanceMeters',
          query: { status: 'open' },
          spherical: true,
        },
      },
      { $limit: limit },
    ]);
  }
  return Report.find({ status: 'open' }).sort({ createdAt: -1 }).limit(limit).lean();
}

export function isValidObjectId(id: string) {
  return mongoose.isValidObjectId(id);
}

/** Puts a few example reports on the map of an empty database, so a fresh install isn't blank. */
export async function seedDemoReports() {
  if ((await Report.estimatedDocumentCount()) > 0) return;

  const byEmail = async (email: string) => {
    const u = await User.findOne({ email });
    return u ? { id: u._id, name: u.name, avatar: u.avatar } : { name: 'Neighbor' };
  };
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000);

  await Report.insertMany([
    {
      reporter: await byEmail('sarah@example.com'),
      title: 'Deep Pothole on Main St Crossing',
      description: 'A massive pothole has formed in the middle lane. It is causing vehicles to swerve suddenly and is hazardous for cyclists after sunset.',
      category: 'Pothole',
      urgency: 'High',
      district: 'Manhattan (New York City, United States)',
      locationDetails: 'Broadway & W 4th St',
      location: { type: 'Point', coordinates: [-73.9965, 40.7286] },
      icon: 'warning',
      image: 'https://images.unsplash.com/photo-1515162305285-0293e4767cc2?w=600',
      upvotes: 28,
      comments: 4,
      createdAt: hoursAgo(2),
    },
    {
      reporter: await byEmail('marcus@example.com'),
      title: 'Broken Bench near North Gate Pond',
      description: 'One of the main support planks on the bench overlooking the pond has snapped. It needs new slats before someone gets hurt.',
      category: 'Park Maintenance',
      urgency: 'Medium',
      district: 'Manhattan (New York City, United States)',
      locationDetails: 'Central Park, near the Pond',
      location: { type: 'Point', coordinates: [-73.9742, 40.7666] },
      icon: 'potted_plant',
      image: 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=600',
      upvotes: 14,
      comments: 2,
      verified: true,
      createdAt: hoursAgo(26),
    },
    {
      reporter: await byEmail('elena@example.com'),
      title: 'Flickering Lamp Post #1024',
      description: 'The streetlight on the corner is flickering constantly, creating a strobe effect at night that makes the crosswalk feel unsafe.',
      category: 'Streetlight',
      urgency: 'Low',
      district: 'Brooklyn (New York City, United States)',
      locationDetails: 'Atlantic Ave & Flatbush Ave',
      location: { type: 'Point', coordinates: [-73.9776, 40.6842] },
      icon: 'lightbulb',
      image: 'https://images.unsplash.com/photo-1509024644558-2f56ce76c490?w=600',
      upvotes: 8,
      comments: 1,
      createdAt: hoursAgo(72),
    },
  ]);
}

export interface Story {
  id: string;
  title: string;
  category: string;
  district: string;
  details: string;
  beforeImage?: string;
  afterImage: string;
  reportedBy: { name: string; avatar?: string };
  resolvedBy: { name: string; avatar?: string };
  reportedAt: string;
  resolvedAt: string;
  hoursToResolve: number;
}

/** Recently resolved reports with their fix photo, for the "before and after" stories page. */
export async function listStories(limit = 12): Promise<Story[]> {
  const rows = await Report.aggregate([
    { $match: { status: 'resolved', 'resolution.image': { $exists: true } } },
    { $sort: { 'resolution.at': -1 } },
    { $limit: limit },
    { $lookup: { from: 'users', localField: 'resolution.by', foreignField: '_id', as: 'resolver', pipeline: [{ $project: { name: 1, avatar: 1 } }] } },
  ]);

  return rows.map((r: any) => ({
    id: String(r._id),
    title: r.title,
    category: r.category,
    district: r.district,
    details: r.resolution.details || '',
    beforeImage: r.image || undefined,
    afterImage: r.resolution.image,
    reportedBy: { name: r.reporter?.name || 'Neighbor', avatar: r.reporter?.avatar },
    resolvedBy: { name: r.resolver[0]?.name || 'Neighbor', avatar: r.resolver[0]?.avatar },
    reportedAt: r.createdAt.toISOString(),
    resolvedAt: r.resolution.at.toISOString(),
    hoursToResolve: Math.round(((r.resolution.at - r.createdAt) / 3_600_000) * 10) / 10,
  }));
}
