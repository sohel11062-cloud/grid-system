import "server-only";

/**
 * In-process sliding-window rate limiter.
 *
 * In Vercel serverless each warm instance has its own state, so this limits
 * per-instance. For a shared limit across instances a Redis store would be
 * needed; for a loyalty system this per-instance limit is sufficient.
 */

interface Entry {
  timestamps: number[];
}

// Survive hot-reload in dev without losing state
declare global {
  // eslint-disable-next-line no-var
  var __GRID_RATE_STORE__: Map<string, Entry> | undefined;
}

function getStore(): Map<string, Entry> {
  if (!global.__GRID_RATE_STORE__) {
    global.__GRID_RATE_STORE__ = new Map();
  }
  return global.__GRID_RATE_STORE__;
}

let lastCleanup = 0;

function maybeGC(store: Map<string, Entry>, windowMs: number): void {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  const cutoff = now - windowMs;
  for (const [key, entry] of store.entries()) {
    const fresh = entry.timestamps.filter((t) => t > cutoff);
    if (fresh.length === 0) {
      store.delete(key);
    } else {
      entry.timestamps = fresh;
    }
  }
}

export interface RateLimitResult {
  allowed:   boolean;
  remaining: number;
  resetAtMs: number;
}

/**
 * @param key       Unique key: e.g. `redeem:${memberId}`
 * @param limit     Max requests allowed within the window
 * @param windowMs  Window length in milliseconds
 */
export function checkRateLimit(
  key:      string,
  limit:    number,
  windowMs: number
): RateLimitResult {
  const store = getStore();
  maybeGC(store, windowMs);

  const now         = Date.now();
  const windowStart = now - windowMs;
  const entry       = store.get(key) ?? { timestamps: [] };

  // Prune expired timestamps
  const fresh = entry.timestamps.filter((t) => t > windowStart);

  if (fresh.length >= limit) {
    const oldestInWindow = Math.min(...fresh);
    return {
      allowed:   false,
      remaining: 0,
      resetAtMs: oldestInWindow + windowMs,
    };
  }

  fresh.push(now);
  store.set(key, { timestamps: fresh });

  return {
    allowed:   true,
    remaining: limit - fresh.length,
    resetAtMs: now + windowMs,
  };
}