// infrastructure/security/rate-limit-store.ts
//
// BACKLOG ITEM 3 (audit finding F-8) -- where the counting happens.
//
// ---------------------------------------------------------------------
// WHY THE PREVIOUS IMPLEMENTATION COUNTED NOTHING
// ---------------------------------------------------------------------
// Rate limiting was `const requestStore = new Map<string, number[]>()`
// at module scope. On Vercel that is per serverless INSTANCE:
//
//   * a burst spread across N warm instances gets N x the limit;
//   * a cold start resets every counter to zero, so an attacker who
//     paces requests just slowly enough to let instances recycle is
//     never limited at all;
//   * nothing is shared with the worker processes.
//
// A limiter that cannot be relied on is worse than none, because the
// routes above it were written as though it worked.
//
// ---------------------------------------------------------------------
// SLIDING WINDOW, PRESERVED EXACTLY
// ---------------------------------------------------------------------
// The in-memory implementation was a sliding-window LOG: it kept the
// timestamps in the window and compared the count to the limit. The
// Redis store keeps that semantics rather than switching to a cheaper
// fixed-window counter, because a fixed window lets 2x the limit through
// across a boundary -- and changing what "100 per minute" means while
// claiming to fix the limiter is the kind of silent behaviour change
// this codebase's phases exist to avoid.
//
// The window lives in a Redis sorted set: score = timestamp, member =
// a unique per-hit token. One EVAL does trim, count, decide and record,
// so two instances hitting the same key concurrently cannot both read
// "99" and both admit a request. Doing it as separate commands over a
// pipeline would reintroduce that race, which is precisely the defect
// being fixed.
//
// ---------------------------------------------------------------------
// WHAT HAPPENS WHEN REDIS IS DOWN
// ---------------------------------------------------------------------
// It falls back to the in-memory store for that call -- NOT to
// "allowed". Per-instance limiting is weaker than distributed limiting,
// but it is still a limit, and it is the honest ceiling on what a
// process can enforce alone.
//
// The alternative, refusing every request while Redis is unreachable,
// converts a cache outage into a total outage. Rate limiting is an
// availability control; failing it closed trades the thing it protects
// for the thing it protects against. Stated here rather than left to be
// discovered: on a Redis outage this platform's effective limit becomes
// (limit x instance count), and that is a deliberate choice.
//
// ---------------------------------------------------------------------
// TESTS AND LOCAL DEVELOPMENT
// ---------------------------------------------------------------------
// The in-memory store is selected whenever REDIS_URL is absent, and
// unconditionally under NODE_ENV=test unless a test opts in via
// `__setRateLimitStore`. A test suite that silently talked to a real
// Redis would be a test suite whose results depend on a developer's
// laptop.

import {
  getSharedRedisClient,
  isRedisConfigured,
  markRedisUnavailable,
} from '@/infrastructure/cache/cache.service';

/** The outcome of recording one request against a key. */
export interface RateLimitHit {
  allowed: boolean;
  /** Requests still permitted in the current window. 0 when blocked. */
  remaining: number;
  /** Epoch ms at which the window frees up. */
  reset: number;
  /** Which store answered. Surfaced for tests, metrics and diagnosis. */
  store: 'redis' | 'memory';
}

export interface RateLimitStore {
  readonly kind: 'redis' | 'memory';
  /**
   * Records one request against `key` and reports whether it is allowed.
   *
   * MUST be atomic with respect to concurrent callers: the check and the
   * record are one operation, or the limit is advisory.
   */
  hit(key: string, windowMs: number, limit: number, now?: number): Promise<RateLimitHit>;
  /** TEST ONLY -- drops all counters. */
  reset(): Promise<void>;
}

// ─── In-memory ────────────────────────────────────────────────────────

/**
 * The original sliding-window log, unchanged in behaviour, now behind
 * the interface so it is explicitly the FALLBACK rather than the
 * implementation.
 *
 * Bounded: `MAX_TRACKED_KEYS` caps the map so a spoofed-key flood (the
 * other half of finding F-8, now also fixed upstream in client-ip.ts)
 * cannot grow it without limit. Eviction drops the oldest-touched key,
 * which in the worst case gives that key a fresh budget -- acceptable,
 * because the alternative is an out-of-memory crash, which gives EVERY
 * key a fresh budget.
 */
const MAX_TRACKED_KEYS = 50_000;

export class InMemoryRateLimitStore implements RateLimitStore {
  readonly kind = 'memory' as const;
  private readonly windows = new Map<string, number[]>();

  async hit(key: string, windowMs: number, limit: number, now = Date.now()): Promise<RateLimitHit> {
    const windowStart = now - windowMs;
    const timestamps = (this.windows.get(key) ?? []).filter((t) => t > windowStart);

    if (timestamps.length >= limit) {
      // Refresh position so an actively-blocked key is not the one
      // evicted under pressure.
      this.windows.delete(key);
      this.windows.set(key, timestamps);
      return {
        allowed: false,
        remaining: 0,
        reset: (timestamps[0] ?? now) + windowMs,
        store: this.kind,
      };
    }

    timestamps.push(now);
    this.windows.delete(key);
    this.windows.set(key, timestamps);

    if (this.windows.size > MAX_TRACKED_KEYS) {
      const oldest = this.windows.keys().next();
      if (!oldest.done) this.windows.delete(oldest.value);
    }

    return {
      allowed: true,
      remaining: limit - timestamps.length,
      reset: now + windowMs,
      store: this.kind,
    };
  }

  async reset(): Promise<void> {
    this.windows.clear();
  }
}

// ─── Redis ────────────────────────────────────────────────────────────

/**
 * Trim, count, decide and record -- one atomic script.
 *
 * Returns [allowed, remaining, reset]. `reset` is derived from the
 * OLDEST surviving entry when blocked, so a client is told when the
 * window actually frees up rather than being handed `now + windowMs`
 * on every rejected retry (which would make a polling client believe
 * it must wait a full window each time).
 */
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - windowMs)
local count = redis.call('ZCARD', key)

if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local reset = now + windowMs
  if oldest[2] then
    reset = tonumber(oldest[2]) + windowMs
  end
  return { 0, 0, reset }
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, windowMs)
return { 1, limit - (count + 1), now + windowMs }
`;

/** Redis key namespace. Distinct from the cache prefix so a cache flush cannot clear the limiter. */
const REDIS_KEY_PREFIX = 'rl';

export class RedisRateLimitStore implements RateLimitStore {
  readonly kind = 'redis' as const;

  constructor(private readonly fallback: RateLimitStore = new InMemoryRateLimitStore()) {}

  async hit(key: string, windowMs: number, limit: number, now = Date.now()): Promise<RateLimitHit> {
    let client: unknown = null;
    try {
      client = await getSharedRedisClient();
    } catch {
      client = null;
    }

    if (!client) {
      return this.fallback.hit(key, windowMs, limit, now);
    }

    try {
      const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;
      const raw = (await (client as {
        eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
      }).eval(
        SLIDING_WINDOW_SCRIPT,
        1,
        `${REDIS_KEY_PREFIX}:${key}`,
        String(now),
        String(windowMs),
        String(limit),
        member
      )) as [number, number, number];

      return {
        allowed: Number(raw[0]) === 1,
        remaining: Math.max(0, Number(raw[1])),
        reset: Number(raw[2]),
        store: this.kind,
      };
    } catch {
      // The connection died mid-command. Mark it so the next call does
      // not pay another timeout, then answer from the local window --
      // see the header on why this is not fail-closed.
      markRedisUnavailable();
      return this.fallback.hit(key, windowMs, limit, now);
    }
  }

  async reset(): Promise<void> {
    await this.fallback.reset();
    try {
      const client = (await getSharedRedisClient()) as {
        keys(pattern: string): Promise<string[]>;
        del(...keys: string[]): Promise<number>;
      } | null;
      if (!client) return;
      const keys = await client.keys(`${REDIS_KEY_PREFIX}:*`);
      if (keys.length > 0) await client.del(...keys);
    } catch {
      /* reset is test-only; a failure here must never break a run */
    }
  }
}

// ─── Selection ────────────────────────────────────────────────────────

let activeStore: RateLimitStore | null = null;

/**
 * Redis when a REDIS_URL is configured, in-memory otherwise.
 *
 * Tests always get the in-memory store unless one explicitly installs
 * another via `__setRateLimitStore`, so a stray REDIS_URL in a
 * developer's environment cannot change what the suite asserts.
 */
export function getRateLimitStore(): RateLimitStore {
  if (activeStore) return activeStore;

  const useRedis = isRedisConfigured() && process.env.NODE_ENV !== 'test';
  activeStore = useRedis ? new RedisRateLimitStore() : new InMemoryRateLimitStore();
  return activeStore;
}

/** TEST ONLY -- installs a specific store, or clears the memoised choice when passed null. */
export function __setRateLimitStore(store: RateLimitStore | null): void {
  activeStore = store;
}
