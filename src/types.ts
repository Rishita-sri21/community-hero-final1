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

// A squad with numbers counted from the database (GET /api/squads)
export interface Squad {
  id: string;
  name: string;
  description: string;
  categories: string[];
  icon: string;
  joinPoints: number;
  members: number;
  memberAvatars: string[];
  // Open reports in the squad's categories near the viewer
  openNearby: number;
  // Reports in those categories fixed by squad members
  fixedByMembers: number;
  joined: boolean;
}

export interface UserStats {
  reportsCreated: number;
  reportsFixed: number;
  verificationsGiven: number;
  upvotesReceived: number;
  rank: number;
  points: number;
  squadsJoined: number;
}

export interface AppNotification {
  id: string;
  type: 'upvote' | 'verify' | 'resolved';
  reportId?: string;
  reportTitle?: string;
  actorName: string;
  read: boolean;
  createdAt: string;
  timeAgo: string;
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
