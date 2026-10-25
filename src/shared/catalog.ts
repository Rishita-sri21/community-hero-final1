// Point values and catalogues shared by the server (which enforces them)
// and the frontend (which only displays them).

export const POINTS = {
  REPORT_CREATED: 20,
  REPORT_UPVOTED: 5,
  REPORT_VERIFIED: 15,
  REPORT_RESOLVED: 150,
} as const;

// Reports beyond this many per day still get created, but earn no points
export const MAX_REWARDED_REPORTS_PER_DAY = 10;

export interface GreenAction {
  id: string;
  title: string;
  points: number;
  icon: string;
}

// Self-reported good deeds: each can earn points once per day
export const GREEN_ACTIONS: GreenAction[] = [
  { id: 'plant-seedling', title: 'Planted Native Seedling', points: 15, icon: 'nature' },
  { id: 'food-bank', title: 'Sorted Food Bank Donations', points: 25, icon: 'volunteer_activism' },
  { id: 'trail-debris', title: 'Cleared Trail Debris', points: 20, icon: 'park' },
  { id: 'streetlight-check', title: 'Checked Streetlight Repair', points: 10, icon: 'lightbulb' },
];

export interface RewardItem {
  id: string;
  title: string;
  description: string;
  cost: number;
  image: string;
  category: 'Green' | 'Transit' | 'Local Biz' | 'Honor';
  icon: string;
}

export const REWARDS: RewardItem[] = [
  {
    id: 'rwd-1',
    title: 'Centennial Compost Seed Pack',
    description: 'Get a curated pack of native wildflower seeds to support local bee populations and add color to your block.',
    cost: 150,
    image: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400',
    category: 'Green',
    icon: 'nature_people',
  },
  {
    id: 'rwd-2',
    title: 'Free Public Transit Day Pass',
    description: 'Exchange your points for a fully paid digital day pass on all city subways and bus routes.',
    cost: 350,
    image: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=400',
    category: 'Transit',
    icon: 'directions_bus',
  },
  {
    id: 'rwd-3',
    title: 'Organic Fair-Trade Coffee Voucher',
    description: 'Enjoy a free craft drink at any participating neighborhood coffee house or local bakery.',
    cost: 200,
    image: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400',
    category: 'Local Biz',
    icon: 'local_cafe',
  },
  {
    id: 'rwd-4',
    title: 'Civic Hero Honor Emblem',
    description: 'An elegant holographic badge pinned to your community profile celebrating your dedication to the historic district.',
    cost: 500,
    image: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=400',
    category: 'Honor',
    icon: 'stars',
  },
];

export interface SquadDefinition {
  id: string;
  name: string;
  description: string;
  // Report categories this squad looks after
  categories: string[];
  icon: string;
  joinPoints: number;
}

// Squads are standing teams, each focused on a few report categories. Their member counts,
// nearby open reports and fixes are computed from the database (services/squads.ts).
export const SQUADS: SquadDefinition[] = [
  {
    id: 'sq-1',
    name: 'Road Safety Squad',
    description: 'Finds, verifies and follows up on potholes and broken streetlights.',
    categories: ['Pothole', 'Streetlight'],
    icon: 'add_road',
    joinPoints: 30,
  },
  {
    id: 'sq-2',
    name: 'Green Spaces Squad',
    description: 'Looks after parks, benches, trees and leaking water fixtures.',
    categories: ['Park Maintenance', 'Water Leakage'],
    icon: 'park',
    joinPoints: 30,
  },
  {
    id: 'sq-3',
    name: 'Clean Streets Squad',
    description: 'Tackles overflowing bins, dumped waste and graffiti.',
    categories: ['Waste Management', 'Graffiti'],
    icon: 'cleaning_services',
    joinPoints: 30,
  },
];

// Joining a squad earns points the first time only; leaving and re-joining earns nothing
export const SQUAD_JOIN_POINTS: Record<string, number> = Object.fromEntries(SQUADS.map((s) => [s.id, s.joinPoints]));
