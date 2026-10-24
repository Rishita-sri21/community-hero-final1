import { Report } from '../types';
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
confidenceScore: number;
restorationDetails: string;
co2OffsetKg: number;
ecoIndexBoost: number;
safetyScoreIncrease: number;
};
heroPointsAwarded?: number;
userSession?: {
points: number | null;
};
}

export interface AuthResponse {
token: string;
user: {
id: string;
name: string;
email: string;
points: number;
avatar: string;
joinedSquads: string[];
role?: 'Volunteer' | 'Civil Servant' | 'Organizer';
district?: string;
};
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

export const api = {
async generateMission(userDistrict: string, reports: any[]) {
const res = await apiFetch('/api/ai/mission', {
method: 'POST',
headers: makeHeaders(),
body: JSON.stringify({ userDistrict, reports }),
});

if (!res.ok) {
  throw new Error('Mission generation failed');
}

return res.json();

},

async register(
  name: string,
  email: string,
  password: string,
  avatar?: string,
  role?: string
): Promise<AuthResponse> {
  const res = await apiFetch("/api/auth/register", {
    method: "POST",
    headers: makeHeaders(),
    body: JSON.stringify({
      name,
      email,
      password,
      avatar,
      role,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({
      error: 'Registration failed',
    }));
    throw new Error(err.error || 'Registration failed');
  }

  const data: AuthResponse = await res.json();
  localStorage.setItem(TOKEN_KEY, data.token);

  return data;
},

async login(
email: string,
password: string
): Promise<AuthResponse> {
const res = await apiFetch('/api/auth/login', {
method: 'POST',
headers: makeHeaders(),
body: JSON.stringify({ email, password }),
});


if (!res.ok) {
  const err = await res.json().catch(() => ({
    error: 'Login failed',
  }));
  throw new Error(err.error || 'Login failed');
}

const data: AuthResponse = await res.json();
localStorage.setItem(TOKEN_KEY, data.token);

return data;


},

async getMe() {
const res = await apiFetch('/api/auth/me', {
method: 'GET',
headers: makeHeaders(),
});


if (!res.ok) {
  localStorage.removeItem(TOKEN_KEY);
  throw new Error('Session expired');
}

return res.json();

},

logout() {
localStorage.removeItem(TOKEN_KEY);
},

async getLeaderboard() {
const res = await apiFetch('/api/leaderboard');

if (!res.ok) {
  throw new Error('Failed to fetch leaderboard');
}

return res.json();

},

async getReports(): Promise<Report[]> {
const res = await apiFetch('/api/reports');


if (!res.ok) {
  throw new Error('Failed to fetch reports');
}

return res.json();


},

async createReport(report: Partial<Report>): Promise<{ report: Report; points: number | null }> {
const res = await apiFetch('/api/reports', {
method: 'POST',
headers: makeHeaders(),
body: JSON.stringify(report),
});


if (!res.ok) {
  throw new Error('Failed to create report');
}

const data = await res.json();
// Older backends returned the bare report; accept both so the frontend and
// backend can be deployed independently.
return data.report ? data : { report: data, points: null };


},

async upvoteReport(id: string) {
const res = await apiFetch(`/api/reports/${id}/upvote`, {
method: 'POST',
headers: makeHeaders(),
});


if (!res.ok) {
  throw new Error('Failed to upvote report');
}

return res.json();


},

async verifyReport(id: string): Promise<{ report: Report; points: number | null }> {
const res = await apiFetch(`/api/reports/${id}/verify`, {
method: 'POST',
headers: makeHeaders(),
});


if (!res.ok) {
  throw new Error('Failed to verify report');
}

return res.json();


},

async resolveReport(reportId: string, imageBase64: string): Promise<ResolveResponse> {
const res = await apiFetch('/api/reports/resolve', {
method: 'POST',
headers: makeHeaders(),
body: JSON.stringify({
reportId,
image: imageBase64,
}),
});

if (!res.ok) {
  throw new Error('Failed to resolve report');
}

return res.json();


},

async joinSquad(squadId: string) {
const res = await apiFetch('/api/users/join-squad', {
method: 'POST',
headers: makeHeaders(),
body: JSON.stringify({ squadId }),
});


if (!res.ok) {
  throw new Error('Failed to join squad');
}

return res.json();


},

async addPoints(amount: number) {
const res = await apiFetch('/api/users/add-points', {
method: 'POST',
headers: makeHeaders(),
body: JSON.stringify({ amount }),
});


if (!res.ok) {
  throw new Error('Failed to add points');
}

return res.json();


},

async spendPoints(amount: number) {
const res = await apiFetch('/api/users/spend-points', {
method: 'POST',
headers: makeHeaders(),
body: JSON.stringify({ amount }),
});

if (!res.ok) {
  throw new Error('Failed to spend points');
}

return res.json();


},

async updateDistrict(district: string) {
  const res = await apiFetch("/api/users/update-district", {
    method: "POST",
    headers: makeHeaders(),
    body: JSON.stringify({ district }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(text);
  }

  return JSON.parse(text);
},

async chatWithAssistant(
messages: ChatMessage[],
userDistrict?: string,
activeReports?: any[]
) {
const res = await apiFetch('/api/assistant/chat', {
method: 'POST',
headers: makeHeaders(),
body: JSON.stringify({
messages,
userDistrict,
activeReports,
}),
});


if (!res.ok) {
  throw new Error('Failed to chat with assistant');
}

return res.json();


},

async getAuditLogs() {
const res = await apiFetch('/api/admin/audit-logs', {
headers: makeHeaders(),
});


if (!res.ok) {
  throw new Error('Failed to retrieve audit logs');
}

return res.json();


},

async getDbStatus() {
const res = await apiFetch('/api/admin/db/status', {
headers: makeHeaders(),
});


if (!res.ok) {
  throw new Error('Failed to retrieve database status');
}

return res.json();


},

async triggerDbBackup() {
const res = await apiFetch('/api/admin/db/backup', {
method: 'POST',
headers: makeHeaders(),
});


if (!res.ok) {
  throw new Error('Failed to trigger database backup');
}

return res.json();


},
};
