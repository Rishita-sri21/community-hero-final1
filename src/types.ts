export interface Report {
  id: string;
  reporter: {
    name: string;
    avatar?: string;
    email?: string;
  };
  timeAgo: string;
  district: string;
  urgency: 'High' | 'Medium' | 'Low';
  category: string;
  title: string;
  description: string;
  upvotes: number;
  comments: number;
  verified: boolean;
  coordinates?: {
    top: string;
    left: string;
  };
  lat?: number;
  lng?: number;
  icon?: string;
  image?: string;
  locationDetails?: string;
  matchPercentage?: number;
  createdAt?: string;
  // Distance from the viewer's neighborhood, when reports were requested near a location
  distanceKm?: number;
  // Set by the server for the user making the request
  isMine?: boolean;
  hasUpvoted?: boolean;
  hasVerified?: boolean;
}

export interface Squad {
  id: string;
  name: string;
  description: string;
  volunteersCount: number;
  volunteersMax: number;
  distance: string;
  category: string;
  icon: string;
}

export interface Citizen {
  rank: number;
  name: string;
  avatar: string;
  points: number;
  isCurrentUser?: boolean;
}

// A resolved report with its fix photo (GET /api/stories)
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

// A walking route through high-priority open reports, planned by the server (services/missions.ts)
export interface MissionStop {
  reportId: string;
  title: string;
  category: string;
  urgency: string;
  lat: number;
  lng: number;
  score: number;
  reasons: string[];
  legKm: number;
}

export interface Mission {
  title: string;
  briefing: string;
  briefingSource: 'gemini' | 'template';
  start: { lat: number; lng: number };
  stops: MissionStop[];
  totalKm: number;
  estimatedMinutes: number;
  totalScore: number;
  consideredReports: number;
  clusters: number;
}

// Neighborhood statistics computed by MongoDB (services/analytics.ts)
export interface NeighborhoodAnalytics {
  radiusKm: number;
  open: number;
  resolved: number;
  resolutionRate: number | null;
  medianHoursToResolve: number | null;
  averageHoursToResolve: number | null;
  last7Days: { date: string; reported: number; resolved: number }[];
  byCategory: { category: string; open: number; resolved: number }[];
  byUrgency: { urgency: string; open: number }[];
}
