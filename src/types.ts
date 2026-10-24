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

export interface Transformation {
  id: string;
  title: string;
  description: string;
  beforeImage: string;
  afterImage: string;
  category: string;
  heroesAvatars: string[];
  reportedBy?: string;
  heroesCount: number;
}
