// A small in-memory cache for expensive read queries.
//
// - TTL: entries expire after ttlMs.
// - Bounded: at most maxEntries, evicting the least recently used (a Map keeps insertion order).
// - Single-flight: if many requests miss the same key at once, the loader runs once and they all
//   share its result, instead of each one hitting the database (a "cache stampede").
// - invalidate(): drops everything, e.g. when the underlying data changes.
//
// It lives in this process's memory, which is right for one server instance; several instances
// would each keep their own copy (still correct with invalidation per instance, just less shared).

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

export function createCache<T>({ ttlMs, maxEntries = 500 }: { ttlMs: number; maxEntries?: number }) {
  const entries = new Map<string, { value: T; expires: number }>();
  const inFlight = new Map<string, Promise<T>>();
  // Bumped by invalidate(), so a load that started before the change doesn't store stale data
  let generation = 0;
  const stats = { hits: 0, misses: 0 };

  async function get(key: string, load: () => Promise<T>): Promise<T> {
    // Tests that write straight to the database (bypassing invalidation) turn caching off
    if (process.env.READ_CACHE === 'off') return load();
    const entry = entries.get(key);
    if (entry && entry.expires > Date.now()) {
      // Re-insert to mark it most recently used
      entries.delete(key);
      entries.set(key, entry);
      stats.hits++;
      return entry.value;
    }
    stats.misses++;

    const pending = inFlight.get(key);
    if (pending) return pending;

    const startedAt = generation;
    const promise = load()
      .then((value) => {
        if (startedAt === generation) {
          entries.delete(key);
          entries.set(key, { value, expires: Date.now() + ttlMs });
          while (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
        }
        return value;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  }

  function invalidate() {
    generation++;
    entries.clear();
    inFlight.clear();
  }

  return { get, invalidate, stats: (): CacheStats => ({ ...stats, size: entries.size }) };
}
