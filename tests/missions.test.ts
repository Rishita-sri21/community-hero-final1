import { describe, expect, it } from 'vitest';
import { clusterByDistance, orderStops, planMission, routeLengthKm, scoreReport, type MissionCandidate } from '../services/missions';
import { templateBriefing } from '../services/ai';

const NOW = new Date('2026-10-25T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

// Roughly 111 m per 0.001° of latitude
function candidate(id: string, lat: number, lng: number, extra: Partial<MissionCandidate> = {}): MissionCandidate {
  return { id, title: id, category: 'Pothole', urgency: 'Medium', upvotes: 0, verifications: 0, createdAt: NOW, lat, lng, ...extra };
}

describe('scoreReport', () => {
  it('ranks by urgency, then support, then waiting time', () => {
    const high = scoreReport(candidate('a', 0, 0, { urgency: 'High' }), NOW).score;
    const low = scoreReport(candidate('b', 0, 0, { urgency: 'Low' }), NOW).score;
    const supported = scoreReport(candidate('c', 0, 0, { urgency: 'Low', upvotes: 3, verifications: 2 }), NOW).score;
    const old = scoreReport(candidate('d', 0, 0, { urgency: 'Low', createdAt: daysAgo(14) }), NOW).score;

    expect(high).toBe(3 * low);
    expect(supported).toBeGreaterThan(low);
    expect(old).toBe(2 * low); // capped at double after two weeks
    expect(scoreReport(candidate('e', 0, 0, { urgency: 'Low', createdAt: daysAgo(60) }), NOW).score).toBe(old);
  });

  it('explains the score', () => {
    const { reasons } = scoreReport(candidate('a', 0, 0, { urgency: 'High', upvotes: 1, verifications: 2, createdAt: daysAgo(3) }), NOW);
    expect(reasons).toEqual(['High urgency', '1 upvote', 'verified by 2', 'open 3 days']);
  });
});

describe('clusterByDistance', () => {
  it('chains nearby points into one group and keeps distant points apart', () => {
    const points = [
      candidate('a', 0, 0),
      candidate('b', 0.005, 0), // ~0.55 km from a
      candidate('c', 0.01, 0), // ~0.55 km from b, 1.1 km from a: joined through b
      candidate('far', 0.1, 0), // ~11 km away
    ];
    const groups = clusterByDistance(points, 0.8).map((g) => g.map((p) => p.id).sort());
    expect(groups).toHaveLength(2);
    expect(groups).toContainEqual(['a', 'b', 'c']);
    expect(groups).toContainEqual(['far']);
  });
});

describe('orderStops', () => {
  it('visits every stop once and removes crossings', () => {
    const start = { lat: 0, lng: 0 };
    // A zig-zag order that crosses itself; the best open path goes along the line
    const stops = [0.004, 0.001, 0.003, 0.002].map((lat) => candidate(String(lat), lat, 0));
    const route = orderStops(start, stops);

    expect(route.map((s) => s.id)).toEqual(['0.001', '0.002', '0.003', '0.004']);
    expect(routeLengthKm(start, route)).toBeLessThan(routeLengthKm(start, stops));
  });

  it('improves on nearest neighbor when greed leads astray', () => {
    const start = { lat: 0, lng: 0 };
    const stops = [
      candidate('east1', 0, 0.002),
      candidate('west', 0, -0.0025),
      candidate('east2', 0, 0.004),
      candidate('east3', 0, 0.006),
    ];
    const route = orderStops(start, stops);
    // Going west first, then sweeping east, is shorter than doubling back for the west stop
    expect(route.map((s) => s.id)).toEqual(['west', 'east1', 'east2', 'east3']);
  });
});

describe('planMission', () => {
  it('returns null when there is nothing to visit', () => {
    expect(planMission([], { lat: 0, lng: 0 })).toBeNull();
  });

  it('picks the most valuable nearby group and limits the number of stops', () => {
    const start = { lat: 0, lng: 0 };
    const nearbyLow = [candidate('low', 0.001, 0, { urgency: 'Low' })];
    const busyBlock = Array.from({ length: 8 }, (_, i) =>
      candidate(`block${i}`, 0.02 + i * 0.001, 0, { urgency: i < 2 ? 'High' : 'Medium' })
    );
    const farAway = [candidate('other-city', 5, 5, { urgency: 'High', upvotes: 50 })];

    const mission = planMission([...nearbyLow, ...busyBlock, ...farAway], start, { now: NOW, maxStops: 6 })!;

    expect(mission.stops).toHaveLength(6);
    expect(mission.stops.every((s) => s.reportId.startsWith('block'))).toBe(true);
    // The two high-urgency reports always make the cut
    expect(mission.stops.map((s) => s.reportId)).toEqual(expect.arrayContaining(['block0', 'block1']));
    expect(mission.consideredReports).toBe(10);
    expect(mission.clusters).toBe(3);
  });

  it('adds up legs into the total and estimates the time', () => {
    const mission = planMission(
      [candidate('a', 0.009, 0), candidate('b', 0.0135, 0)],
      { lat: 0, lng: 0 },
      { now: NOW, walkingKmPerHour: 4.5, detourFactor: 1, minutesPerStop: 10 }
    )!;

    const legSum = mission.stops.reduce((sum, s) => sum + s.legKm, 0);
    expect(mission.totalKm).toBeCloseTo(legSum, 1);
    expect(mission.totalKm).toBeCloseTo(1.5, 1);
    // 1.5 km at 4.5 km/h is 20 minutes, plus 10 per stop
    expect(mission.estimatedMinutes).toBe(40);
  });

  it('builds a briefing from the plan itself when no AI is configured', () => {
    const mission = planMission(
      [candidate('Broken light', 0.001, 0, { category: 'Streetlight', urgency: 'High' })],
      { lat: 0, lng: 0 },
      { now: NOW }
    )!;
    const briefing = templateBriefing(mission, 'Indiranagar (Bengaluru, India)');
    expect(briefing.briefingSource).toBe('template');
    expect(briefing.title).toBe('Streetlight sweep in Indiranagar');
    expect(briefing.briefing).toContain('1 open report, 1 of them high urgency,');
    expect(briefing.briefing).toContain('Start with "Broken light"');
  });
});
