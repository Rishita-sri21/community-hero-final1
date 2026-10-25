import { AppNotification, Mission, NeighborhoodAnalytics, Report, Squad, Story, UserStats } from '../types';
import { API_URL } from '../config';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface ResolveResponse {
  success: boolean;
  message?: string;
  auditResult?: {
    success: boolean;
    // Null when the photo wasn't checked by AI (demo mode)
    confidenceScore: number | null;
    restorationDetails: string;
    simulated?: boolean;
  };
  heroPointsAwarded?: number;
  userSession?: {
    points: number | null;
  };
}

export interface AuthResponse {
  token: string;
  user: {
    _id: string;
    name: string;
    email: string;
    points: number;
    avatar: string;
    joinedSquads: string[];
    role?: 'Volunteer' | 'Civil Servant' | 'Organizer';
    district?: string;
  };
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  avatar?: string;
  points: number;
  userId: string;
}

// Response of any action that changed a report and may have awarded points
export interface ReportActionResponse {
  report: Report;
  points: number | null;
}

const TOKEN_KEY = 'community_hero_token';

const getStoredToken = () => localStorage.getItem(TOKEN_KEY);

const makeHeaders = (additional: Record<string, string> = {}) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...additional,
  };

  const token = getStoredToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
};

const apiFetch = (endpoint: string, options?: RequestInit) => {
  return fetch(`${API_URL}${endpoint}`, options);
};

// Sends a request and returns the parsed JSON. On an error status it throws an Error
// carrying the server's message (e.g. "You already verified this report"), so the UI can show it.
async function request<T>(endpoint: string, options: RequestInit = {}, fallbackError = 'Request failed'): Promise<T> {
  const res = await apiFetch(endpoint, { ...options, headers: makeHeaders() });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || fallbackError);
  }

  return res.json();
}

const post = <T>(endpoint: string, body: unknown, fallbackError: string) =>
  request<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }, fallbackError);

export const api = {
  async register(
    name: string,
    email: string,
    password: string,
    avatar?: string,
    role?: string
  ): Promise<AuthResponse> {
    const data = await post<AuthResponse>('/api/auth/register', { name, email, password, avatar, role }, 'Registration failed');
    localStorage.setItem(TOKEN_KEY, data.token);
    return data;
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const data = await post<AuthResponse>('/api/auth/login', { email, password }, 'Login failed');
    localStorage.setItem(TOKEN_KEY, data.token);
    return data;
  },

  async getMe() {
    try {
      return await request<any>('/api/auth/me', {}, 'Session expired');
    } catch (err) {
      localStorage.removeItem(TOKEN_KEY);
      throw err;
    }
  },

  logout() {
    localStorage.removeItem(TOKEN_KEY);
  },

  getLeaderboard() {
    return request<LeaderboardEntry[]>('/api/leaderboard', {}, 'Failed to fetch leaderboard');
  },

  // With a location, reports come nearest first and include distanceKm
  getReports(near?: { lat: number; lng: number }) {
    const query = near ? `?lat=${near.lat}&lng=${near.lng}` : '';
    return request<Report[]>(`/api/reports${query}`, {}, 'Failed to fetch reports');
  },

  async createReport(report: Partial<Report>): Promise<ReportActionResponse> {
    const data = await post<any>('/api/reports', report, 'Failed to create report');
    // Older backends returned the bare report; accept both so the frontend and
    // backend can be deployed independently.
    return data.report ? data : { report: data, points: null };
  },

  upvoteReport(id: string) {
    return post<ReportActionResponse>(`/api/reports/${id}/upvote`, {}, 'Failed to upvote report');
  },

  verifyReport(id: string) {
    return post<ReportActionResponse>(`/api/reports/${id}/verify`, {}, 'Failed to verify report');
  },

  // Unlike the others, this returns the server's answer even for error statuses,
  // because the body explains why verification failed and the modal shows it.
  async resolveReport(reportId: string, imageBase64: string): Promise<ResolveResponse> {
    const res = await apiFetch('/api/reports/resolve', {
      method: 'POST',
      headers: makeHeaders(),
      body: JSON.stringify({ reportId, image: imageBase64 }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, message: body.message || body.error || 'Failed to resolve report' };
    }
    return body;
  },

  logGreenAction(actionId: string) {
    return post<{ points: number; awarded: number }>('/api/actions/green', { actionId }, 'Failed to log action');
  },

  redeemReward(rewardId: string) {
    return post<{ points: number; code: string }>('/api/rewards/redeem', { rewardId }, 'Failed to redeem reward');
  },

  joinSquad(squadId: string) {
    return post<{ joinedSquads: string[]; points: number; awarded: number }>('/api/users/join-squad', { squadId }, 'Failed to join squad');
  },

  leaveSquad(squadId: string) {
    return post<{ joinedSquads: string[] }>('/api/users/leave-squad', { squadId }, 'Failed to leave squad');
  },

  updateDistrict(district: string) {
    return post<{ success: boolean; user: any }>('/api/users/update-district', { district }, 'Failed to update district');
  },

  // The server looks up the reports near the user itself
  chatWithAssistant(messages: ChatMessage[]) {
    return post<{ text: string }>('/api/assistant/chat', { messages }, 'Failed to chat with assistant');
  },

  planMission(start: { lat: number; lng: number }) {
    return request<{ mission: Mission | null; searchRadiusKm: number }>(
      `/api/missions/plan?lat=${start.lat}&lng=${start.lng}`, {}, 'Failed to plan a mission'
    );
  },

  getStories() {
    return request<Story[]>('/api/stories', {}, 'Failed to load stories');
  },

  getAnalytics(center: { lat: number; lng: number }) {
    return request<NeighborhoodAnalytics>(`/api/analytics?lat=${center.lat}&lng=${center.lng}`, {}, 'Failed to load analytics');
  },

  getAuditLogs() {
    return request<any[]>('/api/admin/audit-logs', {}, 'Failed to retrieve audit logs');
  },

  getDbStatus() {
    return request<any>('/api/admin/db/status', {}, 'Failed to retrieve database status');
  },

  // Downloads a collection as an .ndjson file (one JSON document per line)
  async exportCollection(collection: 'reports' | 'users' | 'auditlogs') {
    const res = await apiFetch(`/api/admin/export/${collection}`, { headers: makeHeaders() });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Export failed');
    }
    const blob = await res.blob();
    const filename = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || `${collection}.ndjson`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return { bytes: blob.size, lines: (await blob.text()).split('\n').filter(Boolean).length };
  },

  getSquads() {
    return request<Squad[]>('/api/squads', {}, 'Failed to load squads');
  },

  getMyStats() {
    return request<UserStats>('/api/users/me/stats', {}, 'Failed to load your stats');
  },

  getNotifications() {
    return request<{ unread: number; items: AppNotification[] }>('/api/notifications', {}, 'Failed to load notifications');
  },

  markNotificationsRead() {
    return post<{ success: boolean }>('/api/notifications/read', {}, 'Failed to update notifications');
  },
};
