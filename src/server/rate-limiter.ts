import "server-only";

interface Entry { timestamps: number[] }

declare global {
  // eslint-disable-next-line no-var
  var __GRID_RATE_STORE__: Map<string, Entry> | undefined;
}

function getStore(): Map<string, Entry> {
  if (!global.__GRID_RATE_STORE__) global.__GRID_RATE_STORE__ = new Map();
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
    if (fresh.length === 0) store.delete(key);
    else entry.timestamps = fresh;
  }
}

export interface RateLimitResult {
  allowed:   boolean;
  remaining: number;
  resetAtMs: number;
}

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
  const fresh       = entry.timestamps.filter((t) => t > windowStart);

  if (fresh.length >= limit) {
    return {
      allowed:   false,
      remaining: 0,
      resetAtMs: Math.min(...fresh) + windowMs,
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
