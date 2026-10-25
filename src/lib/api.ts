import { AppNotification, Mission, SimilarReport, NeighborhoodAnalytics, Report, Squad, Story, UserStats } from '../types';
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
  // The user's new points total
  points?: number | null;
}

// A background job on the server (GET /api/jobs/:id)
export interface JobStatus<Result = unknown> {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  attempts: number;
  maxAttempts: number;
  result?: Result;
  error?: string;
  // For a pending job: when it will next be tried (later than now while it waits to retry)
  runAt?: string;
}

export interface LatencyRow {
  count: number;
  errors?: number;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
}

// Measured by the server since it started (GET /api/admin/performance)
export interface PerformanceSnapshot {
  uptimeSeconds: number;
  eventLoopLagP99Ms: number | null;
  memoryRssMb: number | null;
  routes: Array<LatencyRow & { method: string; route: string }>;
  ai: Array<LatencyRow & { operation: string }>;
  jobs: Array<LatencyRow & { type: string }>;
}

export interface JobQueueStats {
  pending: number;
  running: number;
  done: number;
  failed: number;
  // How long the oldest due job has waited to start; null when none is waiting
  oldestDueSeconds: number | null;
  last24h: Array<{ type: string; completed: number; retried: number; avgWaitMs: number; avgRunMs: number }>;
  recentFailures: Array<{ id: string; type: string; attempts: number; error?: string; finishedAt?: string }>;
}

const JOB_POLL_MS = 1000;
const JOB_WAIT_LIMIT_MS = 3 * 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  getPerformance() {
    return request<PerformanceSnapshot>('/api/admin/performance', {}, 'Failed to load performance metrics');
  },

  getJobQueue() {
    return request<JobQueueStats>('/api/admin/jobs', {}, 'Failed to load the job queue');
  },

  retryJob(id: string) {
    return post<JobStatus>(`/api/admin/jobs/${id}/retry`, {}, 'Failed to retry the job');
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

  async findSimilarReports(params: { lat: number; lng: number; title: string; description: string; category: string }) {
    const query = new URLSearchParams({
      lat: String(params.lat),
      lng: String(params.lng),
      title: params.title,
      description: params.description,
      category: params.category,
    });
    const data = await request<{ matches: SimilarReport[] }>(`/api/reports/similar?${query}`, {}, 'Failed to look for similar reports');
    return data.matches;
  },

  async mergeDuplicate(id: string, intoId: string) {
    const data = await post<{ report: Report }>(`/api/reports/${id}/duplicate`, { of: intoId }, 'Failed to merge the reports');
    return data.report;
  },

  getJob<Result = unknown>(id: string) {
    return request<JobStatus<Result>>(`/api/jobs/${id}`, {}, 'Failed to load job');
  },

  // Submits the fix photo, then follows the background check until it finishes, reporting
  // each change of state to onProgress. Like before, failures come back as { success: false,
  // message } rather than throwing, because the modal shows the server's explanation.
  async resolveReport(
    reportId: string,
    imageBase64: string,
    onProgress?: (job: JobStatus<ResolveResponse>) => void
  ): Promise<ResolveResponse> {
    const res = await apiFetch('/api/reports/resolve', {
      method: 'POST',
      headers: makeHeaders(),
      body: JSON.stringify({ reportId, image: imageBase64 }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, message: body.message || body.error || 'Failed to resolve report' };
    }
    // Backends from before the job queue answered at once
    if (res.status !== 202) {
      return { ...body, points: body.points ?? body.userSession?.points ?? null };
    }

    let job: JobStatus<ResolveResponse> = body.job;
    const deadline = Date.now() + JOB_WAIT_LIMIT_MS;
    onProgress?.(job);
    while (job.status === 'pending' || job.status === 'running') {
      if (Date.now() > deadline) {
        return { success: false, message: 'The photo check is taking longer than usual. Check the report again in a few minutes.' };
      }
      await sleep(JOB_POLL_MS);
      try {
        job = await api.getJob<ResolveResponse>(job.id);
        onProgress?.(job);
      } catch {
        // A dropped poll isn't fatal: the job keeps running on the server; try again next tick
      }
    }
    if (job.status === 'failed') {
      return { success: false, message: `The photo could not be checked after ${job.attempts} tries. Please try again later.` };
    }
    return job.result ?? { success: false, message: 'The photo check finished without a result.' };
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
