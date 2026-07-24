// Hand-rolled in-memory TTL cache — no dependency (redis, node-cache, etc.), matching this
// codebase's existing philosophy of small hand-rolled utilities over new packages (see
// lib/csv.ts, modules/cases/gherkin.ts, modules/reports/aggregation.ts). Appropriate for a
// single-process dev/portfolio deployment; a real multi-instance deployment would need a shared
// cache (Redis) instead, since this one is local to whichever process holds it.
//
// Read-through, not write-invalidated: entries expire on their own after `ttlMs` rather than
// being explicitly cleared on the writes that would affect them. Deliberate — the mutation call
// sites that could invalidate a report's cache are numerous and scattered (every result
// submission, run close, case edit, bulk operation), and wiring invalidation into all of them
// would be a much larger, easier-to-get-wrong change than accepting a short staleness window.
// Reports/dashboards are inherently summaries, not live transactional views, so "correct within
// the last `ttlMs`" is an acceptable tradeoff here — do not reuse this cache for anything that
// needs to reflect a write immediately (e.g. never cache a single record a client just mutated
// and expects to read back right away).

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

// Skipped under Jest for the same reason rateLimit.ts's limiters are — a cached response from one
// test would otherwise leak into the next test's assertions within the same file's shared
// in-memory store, since tests run in the same process the cache lives in.
const isTest = !!process.env.JEST_WORKER_ID;

export async function getOrSetCache<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  if (isTest) return fn();

  const now = Date.now();
  const existing = store.get(key);
  if (existing && existing.expiresAt > now) {
    return existing.value as T;
  }

  const value = await fn();
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

// Exposed for the rare mutation that DOES want to force freshness on its own read path (e.g. a
// test, or a future targeted invalidation) rather than waiting out the TTL.
export function clearCache(keyPrefix?: string) {
  if (!keyPrefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(keyPrefix)) store.delete(key);
  }
}
