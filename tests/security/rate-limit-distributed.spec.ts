// tests/security/rate-limit-distributed.spec.ts
//
// BACKLOG ITEM 3 (audit finding F-8) -- two defects, one suite.
//
//   1. The counter was a per-instance `Map`, so on Vercel a burst spread
//      over N warm instances got N x the limit and a cold start reset
//      every bucket to zero.
//   2. The KEY was the leftmost `x-forwarded-for` entry, which the
//      caller writes. A client that varies it lands in a fresh bucket
//      every request, so even a perfect store would have counted
//      nothing.
//
// The second is the one worth proving hardest: it is the difference
// between "the limiter is weaker than advertised" and "the limiter does
// not exist".

import { NextRequest } from 'next/server';

import {
  getClientIp,
  resolveClientIp,
  normalizeIp,
  trustedProxyHops,
  UNKNOWN_CLIENT_IP,
} from '@/infrastructure/security/client-ip';
import {
  InMemoryRateLimitStore,
  RedisRateLimitStore,
  RateLimitStore,
  getRateLimitStore,
  __setRateLimitStore,
} from '@/infrastructure/security/rate-limit-store';
import { RateLimiter } from '@/infrastructure/security/rate-limit';

function request(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost${path}`, { headers });
}

const ENV_KEYS = ['TRUSTED_PROXY_HOPS', 'TRUSTED_CLIENT_IP_HEADER', 'VERCEL', 'REDIS_URL'] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
  __setRateLimitStore(null);
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key]!;
  }
  __setRateLimitStore(null);
});

// ─────────────────────────────────────────────────────────────────────
describe('client IP resolution (the rate-limit key)', () => {
  it('takes the entry the trusted proxy wrote, not the one the client sent', () => {
    // The client forged the first two entries; the single trusted proxy
    // in front of the app appended the address it actually saw.
    const req = request('/api/vehicles', {
      'x-forwarded-for': '10.0.0.1, 192.168.1.1, 203.0.113.7',
    });

    expect(getClientIp(req)).toBe('203.0.113.7');
    // The regression this suite exists for: the old implementation
    // returned the first entry.
    expect(getClientIp(req)).not.toBe('10.0.0.1');
  });

  it('counts hops from the right when a CDN sits in front of the platform proxy', () => {
    process.env.TRUSTED_PROXY_HOPS = '2';

    const req = request('/api/vehicles', {
      'x-forwarded-for': 'forged, 203.0.113.7, 198.51.100.4',
    });

    // Two trusted hops: the CDN saw 203.0.113.7 and the platform proxy
    // saw the CDN. The client address is the CDN's observation.
    expect(getClientIp(req)).toBe('203.0.113.7');
  });

  it('refuses to attribute a chain shorter than the configured hop count', () => {
    process.env.TRUSTED_PROXY_HOPS = '2';

    // Only one entry: this request did not traverse the two proxies this
    // deployment expects, so nothing in the header is attributable.
    // Falling back to the leftmost value is exactly the defect.
    const req = request('/api/vehicles', { 'x-forwarded-for': '10.0.0.1' });

    expect(getClientIp(req)).toBe(UNKNOWN_CLIENT_IP);
  });

  it('prefers a platform header on Vercel and ignores the forged chain entirely', () => {
    process.env.VERCEL = '1';

    const req = request('/api/vehicles', {
      'x-forwarded-for': '10.0.0.1, 10.0.0.2',
      'x-real-ip': '203.0.113.9',
    });

    const resolved = resolveClientIp(req);
    expect(resolved.ip).toBe('203.0.113.9');
    expect(resolved.source).toBe('vercel');
  });

  it('ignores platform headers when the platform is NOT detected', () => {
    // Off Vercel, `x-real-ip` is just another header a client can send.
    const req = request('/api/vehicles', { 'x-real-ip': '203.0.113.9' });
    expect(getClientIp(req)).toBe(UNKNOWN_CLIENT_IP);
  });

  it('honours an explicitly configured trusted header', () => {
    process.env.TRUSTED_CLIENT_IP_HEADER = 'cf-connecting-ip';

    const req = request('/api/vehicles', {
      'cf-connecting-ip': '203.0.113.11',
      'x-forwarded-for': 'forged',
    });

    const resolved = resolveClientIp(req);
    expect(resolved.ip).toBe('203.0.113.11');
    expect(resolved.source).toBe('configured-header');
  });

  it('rejects junk rather than turning it into a cache key', () => {
    expect(normalizeIp('not-an-ip')).toBeNull();
    expect(normalizeIp('')).toBeNull();
    expect(normalizeIp('x'.repeat(4096))).toBeNull();
    expect(normalizeIp('203.0.113.999')).toBeNull();
    expect(normalizeIp('203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeIp('203.0.113.7:51234')).toBe('203.0.113.7');
    expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1');
    expect(normalizeIp('[2001:db8::1]:443')).toBe('2001:db8::1');
  });

  it('refuses a nonsensical hop count instead of silently defaulting', () => {
    process.env.TRUSTED_PROXY_HOPS = 'two';
    expect(() => trustedProxyHops()).toThrow(/TRUSTED_PROXY_HOPS/);

    process.env.TRUSTED_PROXY_HOPS = '0';
    expect(() => trustedProxyHops()).toThrow(/TRUSTED_PROXY_HOPS/);
  });

  it('a spoofed chain can no longer buy an unlimited budget', async () => {
    const store = new InMemoryRateLimitStore();
    __setRateLimitStore(store);
    const limiter = new RateLimiter();

    const results: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      // Every request forges a DIFFERENT leftmost entry; the real
      // client address (appended by the trusted proxy) is constant.
      const req = request('/api/vehicles', {
        'x-forwarded-for': `10.0.0.${i}, 203.0.113.7`,
      });
      const { allowed } = await limiter.checkLimit(req, { windowMs: 60_000, maxRequests: 5 });
      results.push(allowed);
    }

    expect(results).toEqual([true, true, true, true, true, false]);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('in-memory store (tests and local development)', () => {
  it('is the store selected when REDIS_URL is absent', () => {
    delete process.env.REDIS_URL;
    expect(getRateLimitStore().kind).toBe('memory');
  });

  it('is still selected under NODE_ENV=test even with a REDIS_URL present', () => {
    // A stray REDIS_URL in a developer's shell must not change what the
    // suite asserts, or the results depend on whose laptop ran them.
    process.env.REDIS_URL = 'redis://localhost:6379';
    expect(process.env.NODE_ENV).toBe('test');
    expect(getRateLimitStore().kind).toBe('memory');
  });

  it('admits exactly `limit` requests in a window, then blocks', async () => {
    const store = new InMemoryRateLimitStore();
    const now = 1_000_000;

    const outcomes: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      outcomes.push((await store.hit('k', 60_000, 3, now + i)).allowed);
    }

    expect(outcomes).toEqual([true, true, true, false]);
  });

  it('slides: a request admitted once the oldest entry ages out', async () => {
    const store = new InMemoryRateLimitStore();
    const t0 = 1_000_000;

    await store.hit('k', 1_000, 1, t0);
    expect((await store.hit('k', 1_000, 1, t0 + 500)).allowed).toBe(false);
    // The first entry is now outside the window.
    expect((await store.hit('k', 1_000, 1, t0 + 1_500)).allowed).toBe(true);
  });

  it('reports a reset derived from the oldest surviving entry, not now+window', async () => {
    const store = new InMemoryRateLimitStore();
    const t0 = 1_000_000;

    await store.hit('k', 10_000, 1, t0);
    const blocked = await store.hit('k', 10_000, 1, t0 + 4_000);

    expect(blocked.allowed).toBe(false);
    // A client polling every second must be told the window frees at
    // t0+10s, not that it must wait a fresh 10s on every retry.
    expect(blocked.reset).toBe(t0 + 10_000);
  });

  it('keeps buckets separate per key', async () => {
    const store = new InMemoryRateLimitStore();
    await store.hit('a', 60_000, 1);
    expect((await store.hit('b', 60_000, 1)).allowed).toBe(true);
    expect((await store.hit('a', 60_000, 1)).allowed).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('Redis store', () => {
  /**
   * A stand-in for ioredis's `eval`, running the same decision the Lua
   * script encodes against a shared JS map.
   *
   * WHAT THIS PROVES AND WHAT IT DOES NOT. It proves the store issues
   * ONE atomic call carrying the right arguments, reads the reply
   * correctly, and -- because the map is shared between two store
   * instances -- that two application instances counting against one
   * Redis see a SINGLE budget rather than one each. That is the actual
   * finding: `Map`-per-instance gave N x the limit.
   *
   * It does not prove Redis executes the script atomically; that is
   * Redis's contract, and asserting it would need a real server.
   */
  function fakeRedis() {
    const zsets = new Map<string, Array<{ score: number; member: string }>>();
    const evalCalls: unknown[][] = [];

    return {
      evalCalls,
      zsets,
      async eval(_script: string, _numKeys: number, ...args: (string | number)[]) {
        evalCalls.push(args);
        const [key, nowRaw, windowRaw, limitRaw, member] = args as string[];
        const now = Number(nowRaw);
        const windowMs = Number(windowRaw);
        const limit = Number(limitRaw);

        const entries = (zsets.get(key) ?? []).filter((e) => e.score > now - windowMs);
        zsets.set(key, entries);

        if (entries.length >= limit) {
          const oldest = entries[0];
          return [0, 0, (oldest ? oldest.score : now) + windowMs];
        }

        entries.push({ score: now, member });
        return [1, limit - entries.length, now + windowMs];
      },
      async keys() {
        return [];
      },
      async del() {
        return 0;
      },
    };
  }

  it('counts one shared budget across two application instances', async () => {
    const redis = fakeRedis();
    jest
      .spyOn(require('@/infrastructure/cache/cache.service'), 'getSharedRedisClient')
      .mockResolvedValue(redis as never);

    // Two stores = two serverless instances pointed at one Redis.
    const instanceA: RateLimitStore = new RedisRateLimitStore();
    const instanceB: RateLimitStore = new RedisRateLimitStore();

    const t0 = 2_000_000;
    expect((await instanceA.hit('ip:/api/x', 60_000, 2, t0)).allowed).toBe(true);
    expect((await instanceB.hit('ip:/api/x', 60_000, 2, t0 + 1)).allowed).toBe(true);
    // The third request is refused no matter which instance receives it.
    // With the old per-instance Map, instance B still had a full budget.
    expect((await instanceB.hit('ip:/api/x', 60_000, 2, t0 + 2)).allowed).toBe(false);
    expect((await instanceA.hit('ip:/api/x', 60_000, 2, t0 + 3)).allowed).toBe(false);

    jest.restoreAllMocks();
  });

  it('makes exactly one round trip per check, carrying key/now/window/limit', async () => {
    const redis = fakeRedis();
    jest
      .spyOn(require('@/infrastructure/cache/cache.service'), 'getSharedRedisClient')
      .mockResolvedValue(redis as never);

    const store = new RedisRateLimitStore();
    await store.hit('bucket', 30_000, 7, 5_000);

    // One call: check-then-record as two commands is the race the
    // script exists to remove.
    expect(redis.evalCalls).toHaveLength(1);
    const [key, now, windowMs, limit] = redis.evalCalls[0] as string[];
    expect(key).toBe('rl:bucket');
    expect(now).toBe('5000');
    expect(windowMs).toBe('30000');
    expect(limit).toBe('7');

    jest.restoreAllMocks();
  });

  it('reports which store answered, so a silent degradation is visible', async () => {
    const redis = fakeRedis();
    jest
      .spyOn(require('@/infrastructure/cache/cache.service'), 'getSharedRedisClient')
      .mockResolvedValue(redis as never);

    const store = new RedisRateLimitStore();
    expect((await store.hit('k', 60_000, 5)).store).toBe('redis');

    jest.restoreAllMocks();
  });

  it('falls back to the local window when Redis is unreachable -- still limiting, not open', async () => {
    jest
      .spyOn(require('@/infrastructure/cache/cache.service'), 'getSharedRedisClient')
      .mockResolvedValue(null as never);

    const store = new RedisRateLimitStore();
    const t0 = 3_000_000;

    expect((await store.hit('k', 60_000, 2, t0)).allowed).toBe(true);
    expect((await store.hit('k', 60_000, 2, t0 + 1)).allowed).toBe(true);

    const blocked = await store.hit('k', 60_000, 2, t0 + 2);
    // The point of the assertion: an unreachable Redis degrades to
    // per-instance limiting, it does NOT admit everything. A limiter
    // that fails open turns a cache outage into an unmetered endpoint.
    expect(blocked.allowed).toBe(false);
    expect(blocked.store).toBe('memory');

    jest.restoreAllMocks();
  });

  it('falls back when the command itself throws mid-request', async () => {
    jest
      .spyOn(require('@/infrastructure/cache/cache.service'), 'getSharedRedisClient')
      .mockResolvedValue({
        eval: async () => {
          throw new Error('ECONNRESET');
        },
      } as never);
    const markUnavailable = jest
      .spyOn(require('@/infrastructure/cache/cache.service'), 'markRedisUnavailable')
      .mockImplementation(() => undefined);

    const store = new RedisRateLimitStore();
    const result = await store.hit('k', 60_000, 5, 1);

    expect(result.allowed).toBe(true);
    expect(result.store).toBe('memory');
    // Marked dead so the next request does not pay another timeout.
    expect(markUnavailable).toHaveBeenCalled();

    jest.restoreAllMocks();
  });
});
