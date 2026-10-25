import Report from '../models/Report';
import { CATEGORIES } from './reports';

// Neighborhood statistics, computed by MongoDB from the stored reports in one aggregation.

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface NeighborhoodAnalytics {
  radiusKm: number;
  open: number;
  resolved: number;
  resolutionRate: number | null; // share of reports that got fixed, 0–1
  medianHoursToResolve: number | null;
  averageHoursToResolve: number | null;
  last7Days: { date: string; reported: number; resolved: number }[];
  byCategory: { category: string; open: number; resolved: number }[];
  byUrgency: { urgency: string; open: number }[];
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10); // UTC day, YYYY-MM-DD
}

export function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

export async function neighborhoodAnalytics(
  center: { lat: number; lng: number },
  radiusKm = 25,
  now = new Date()
): Promise<NeighborhoodAnalytics> {
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 6 * DAY_MS);

  const [result] = await Report.aggregate([
    // $geoNear must come first; it uses the 2dsphere index to keep only reports in range
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [center.lng, center.lat] },
        distanceField: 'distanceMeters',
        maxDistance: radiusKm * 1000,
        spherical: true,
      },
    },
    {
      $facet: {
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        byCategory: [
          {
            $group: {
              _id: '$category',
              open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
              resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
            },
          },
        ],
        byUrgency: [{ $match: { status: 'open' } }, { $group: { _id: '$urgency', open: { $sum: 1 } } }],
        reportedPerDay: [
          { $match: { createdAt: { $gte: weekStart } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        ],
        resolvedPerDay: [
          { $match: { status: 'resolved', 'resolution.at': { $gte: weekStart } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$resolution.at' } }, count: { $sum: 1 } } },
        ],
        // Hours from report to fix, for the most recent fixes
        resolutionHours: [
          { $match: { status: 'resolved', 'resolution.at': { $exists: true } } },
          { $sort: { 'resolution.at': -1 } },
          { $limit: 1000 },
          { $project: { _id: 0, hours: { $divide: [{ $subtract: ['$resolution.at', '$createdAt'] }, HOUR_MS] } } },
        ],
      },
    },
  ]);

  const statusCount = (status: string) => result.byStatus.find((s: any) => s._id === status)?.count ?? 0;
  const open = statusCount('open');
  const resolved = statusCount('resolved');
  const hours: number[] = result.resolutionHours.map((r: any) => r.hours);

  const perDay = (rows: any[]) => new Map<string, number>(rows.map((r) => [r._id, r.count]));
  const reported = perDay(result.reportedPerDay);
  const fixed = perDay(result.resolvedPerDay);
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = dayKey(new Date(weekStart.getTime() + i * DAY_MS));
    return { date, reported: reported.get(date) ?? 0, resolved: fixed.get(date) ?? 0 };
  });

  const categoryRows = new Map<string, any>(result.byCategory.map((c: any) => [c._id, c]));
  const byCategory = CATEGORIES.map((category) => ({
    category,
    open: categoryRows.get(category)?.open ?? 0,
    resolved: categoryRows.get(category)?.resolved ?? 0,
  }));

  return {
    radiusKm,
    open,
    resolved,
    resolutionRate: open + resolved > 0 ? Math.round((resolved / (open + resolved)) * 1000) / 1000 : null,
    medianHoursToResolve: round1(median(hours)),
    averageHoursToResolve: round1(hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null),
    last7Days,
    byCategory,
    byUrgency: ['High', 'Medium', 'Low'].map((urgency) => ({
      urgency,
      open: result.byUrgency.find((u: any) => u._id === urgency)?.open ?? 0,
    })),
  };
}
