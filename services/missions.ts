import { distanceBetweenKm } from '../src/shared/neighborhoods';

// Plans a "mission": a short walk that visits the open reports most worth a volunteer's time.
// Everything here is plain computation on real reports, so it can be unit tested without a database.
//
// 1. Score each report by urgency, community support (upvotes, verifications) and how long it has waited.
// 2. Group reports that are within walking distance of each other (single-linkage clustering).
// 3. Pick the group with the most total priority, discounted by how far away it is.
// 4. Order its stops into a short walking route: nearest neighbor first, then local search
//    (2-opt and relocate moves) until no change makes it shorter.

type LatLng = { lat: number; lng: number };

export interface MissionCandidate extends LatLng {
  id: string;
  title: string;
  category: string;
  urgency: 'High' | 'Medium' | 'Low';
  upvotes: number;
  verifications: number;
  createdAt: Date;
}

export interface MissionStop extends LatLng {
  reportId: string;
  title: string;
  category: string;
  urgency: string;
  score: number;
  reasons: string[];
  // Straight-line distance from the previous stop (or the start)
  legKm: number;
}

export interface Mission {
  stops: MissionStop[];
  totalKm: number;
  estimatedMinutes: number;
  totalScore: number;
  // How many open reports were considered, and how many groups they formed
  consideredReports: number;
  clusters: number;
}

export const PLANNER_DEFAULTS = {
  // Two reports this close belong to the same group
  clusterRadiusKm: 0.8,
  maxStops: 6,
  // Walking speed, and a typical ratio of street distance to straight-line distance
  walkingKmPerHour: 4.5,
  detourFactor: 1.3,
  minutesPerStop: 10,
};

const URGENCY_WEIGHT = { High: 3, Medium: 2, Low: 1 } as const;
const DAY_MS = 86_400_000;

/** Higher means more worth visiting. Each factor is explained in `reasons`. */
export function scoreReport(report: MissionCandidate, now = new Date()) {
  const urgency = URGENCY_WEIGHT[report.urgency] ?? 1;
  // Verifications count double: someone confirmed the problem in person
  const support = 1 + Math.log2(1 + report.upvotes + 2 * report.verifications);
  const ageDays = Math.max(0, (now.getTime() - report.createdAt.getTime()) / DAY_MS);
  // Waiting longer raises priority, up to double after two weeks
  const age = 1 + Math.min(ageDays, 14) / 14;

  const reasons = [`${report.urgency} urgency`];
  if (report.upvotes > 0) reasons.push(`${report.upvotes} upvote${report.upvotes === 1 ? '' : 's'}`);
  if (report.verifications > 0) reasons.push(`verified by ${report.verifications}`);
  if (ageDays >= 1) reasons.push(`open ${Math.floor(ageDays)} day${Math.floor(ageDays) === 1 ? '' : 's'}`);

  return { score: Math.round(urgency * support * age * 10) / 10, reasons };
}

/**
 * Groups points so that any two points closer than `radiusKm` end up in the same group
 * (connected components, found with union-find). O(n²), fine for a few hundred reports.
 */
export function clusterByDistance<T extends LatLng>(points: T[], radiusKm: number): T[][] {
  const parent = points.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (distanceBetweenKm(points[i], points[j]) <= radiusKm) {
        parent[find(i)] = find(j);
      }
    }
  }

  const groups = new Map<number, T[]>();
  points.forEach((p, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), p]);
  });
  return [...groups.values()];
}

/** Length of the walk start → stops[0] → stops[1] → ... (no return to start). */
export function routeLengthKm(start: LatLng, stops: LatLng[]) {
  let total = 0;
  let previous = start;
  for (const stop of stops) {
    total += distanceBetweenKm(previous, stop);
    previous = stop;
  }
  return total;
}

/** Orders stops into a short open walk from `start`: nearest neighbor, then local search. */
export function orderStops<T extends LatLng>(start: LatLng, stops: T[]): T[] {
  // Nearest neighbor: always walk to the closest stop not yet visited
  const remaining = [...stops];
  const route: T[] = [];
  let current: LatLng = start;
  while (remaining.length > 0) {
    let best = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (distanceBetweenKm(current, remaining[i]) < distanceBetweenKm(current, remaining[best])) best = i;
    }
    current = remaining.splice(best, 1)[0];
    route.push(current as T);
  }

  // Local search until no move helps:
  // - 2-opt: reverse a section of the route (removes crossings)
  // - relocate: move one stop to another position (fixes a stop greed left for last)
  const length = () => routeLengthKm(start, route);
  const tryCandidate = (candidate: T[]) => {
    if (routeLengthKm(start, candidate) < length() - 1e-9) {
      route.splice(0, route.length, ...candidate);
      return true;
    }
    return false;
  };

  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        if (tryCandidate([...route.slice(0, i), ...route.slice(i, j + 1).reverse(), ...route.slice(j + 1)])) improved = true;
      }
    }
    for (let from = 0; from < route.length; from++) {
      for (let to = 0; to < route.length; to++) {
        if (from === to) continue;
        const candidate = [...route];
        const [stop] = candidate.splice(from, 1);
        candidate.splice(to, 0, stop);
        if (tryCandidate(candidate)) improved = true;
      }
    }
  }
  return route;
}

/** Returns the best mission starting from `start`, or null when there are no open reports. */
export function planMission(
  candidates: MissionCandidate[],
  start: LatLng,
  options: Partial<typeof PLANNER_DEFAULTS> & { now?: Date } = {}
): Mission | null {
  const opts = { ...PLANNER_DEFAULTS, ...options };
  if (candidates.length === 0) return null;

  const scored = candidates.map((c) => ({ ...c, ...scoreReport(c, options.now) }));
  const clusters = clusterByDistance(scored, opts.clusterRadiusKm);

  // Within each group keep the highest-priority stops, then weigh the group by its
  // total priority against the distance to reach it (2 km away halves its value)
  let best: { stops: typeof scored; value: number } | null = null;
  for (const cluster of clusters) {
    const stops = [...cluster].sort((a, b) => b.score - a.score).slice(0, opts.maxStops);
    const total = stops.reduce((sum, s) => sum + s.score, 0);
    const reachKm = Math.min(...stops.map((s) => distanceBetweenKm(start, s)));
    const value = total / (1 + reachKm / 2);
    if (!best || value > best.value) best = { stops, value };
  }

  const route = orderStops(start, best!.stops);
  let previous: LatLng = start;
  const stops: MissionStop[] = route.map((s) => {
    const legKm = distanceBetweenKm(previous, s);
    previous = s;
    return {
      reportId: s.id,
      title: s.title,
      category: s.category,
      urgency: s.urgency,
      lat: s.lat,
      lng: s.lng,
      score: s.score,
      reasons: s.reasons,
      legKm: Math.round(legKm * 100) / 100,
    };
  });

  const totalKm = routeLengthKm(start, route);
  const walkingMinutes = ((totalKm * opts.detourFactor) / opts.walkingKmPerHour) * 60;
  return {
    stops,
    totalKm: Math.round(totalKm * 100) / 100,
    estimatedMinutes: Math.round(walkingMinutes + stops.length * opts.minutesPerStop),
    totalScore: Math.round(stops.reduce((sum, s) => sum + s.score, 0) * 10) / 10,
    consideredReports: candidates.length,
    clusters: clusters.length,
  };
}
