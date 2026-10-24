import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Minimal in-memory localStorage, since tests run in Node rather than a browser
function createStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('api client', () => {
  let storage: ReturnType<typeof createStorage>;

  beforeEach(() => {
    storage = createStorage();
    vi.stubGlobal('localStorage', storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('upvoteReport returns the updated report and sends the stored token', async () => {
    storage.setItem('community_hero_token', 'abc123');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'rep-1', upvotes: 5 }));
    vi.stubGlobal('fetch', fetchMock);

    const { api } = await import('../src/lib/api');
    const updated = await api.upvoteReport('rep-1');

    expect(updated).toEqual({ id: 'rep-1', upvotes: 5 });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/reports\/rep-1\/upvote$/);
    expect(options.headers.Authorization).toBe('Bearer abc123');
  });

  it('register throws the server error and does not store a token on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(400, { error: 'User already exists' })));

    const { api } = await import('../src/lib/api');
    await expect(api.register('Ana', 'ana@example.com', 'secret-123')).rejects.toThrow('User already exists');
    expect(storage.getItem('community_hero_token')).toBeNull();
  });
});

describe('api client: createReport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts both the new { report, points } response and the older bare report', async () => {
    vi.stubGlobal('localStorage', createStorage());
    const { api } = await import('../src/lib/api');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(201, { report: { id: 'rep-9' }, points: 120 })));
    expect(await api.createReport({ title: 't', description: 'd' })).toEqual({ report: { id: 'rep-9' }, points: 120 });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(201, { id: 'rep-10' })));
    expect(await api.createReport({ title: 't', description: 'd' })).toEqual({ report: { id: 'rep-10' }, points: null });
  });
});
