// infrastructure/cache/cache.service.ts
// In-memory implementation used when REDIS_URL is absent.
// Automatically switches to Redis when REDIS_URL is present.
//
// FIX (root cause of the ETIMEDOUT storm / 4-9s request stalls seen in
// Vercel logs): the previous `new Redis(url, { lazyConnect: true })` used
// ioredis's DEFAULT retryStrategy, which retries FOREVER with exponential
// backoff and emits an 'error' event on every failed attempt -- with no
// listener attached, Node logs "Unhandled error event" and, worse, every
// caller awaiting a command on this connection sits through however long
// the OS TCP timeout takes before falling through. Since `_redisPromise`
// is a module-level singleton, a single unreachable Redis host degrades
// EVERY request on that warm serverless instance, indefinitely, until the
// instance recycles.
//
// Fix: cap retries, set a short connectTimeout so failures resolve in
// milliseconds not multi-second OS timeouts, attach a no-op error handler
// so ioredis doesn't crash the process, and permanently fall back to the
// in-memory store after a connection is confirmed dead instead of
// re-attempting on every single call.

export interface CacheOptions {
  ttl?: number; // seconds
  prefix?: string;
}

const REDIS_CONNECT_TIMEOUT_MS = 1500;
const REDIS_MAX_RETRIES = 2;

// Lazy Redis singleton -- now uses dynamic import.
let _redisPromise: Promise<any> | null = null;
// Once we've confirmed Redis is unreachable, stop trying for the rest of
// this warm instance's lifetime instead of re-attempting per call.
let _redisDisabled = false;

function getRedisPromise(): Promise<any> {
  if (!process.env.REDIS_URL || _redisDisabled) return Promise.resolve(null);
  if (_redisPromise) return _redisPromise;

  _redisPromise = (async () => {
    try {
      const { default: Redis } = await import('ioredis');
      const client = new Redis(process.env.REDIS_URL!, {
        lazyConnect: true,
        connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
        // Cap retries instead of the default infinite backoff. Returning
        // null tells ioredis to stop retrying and treat the connection
        // as failed.
        retryStrategy: (times: number) => {
          if (times > REDIS_MAX_RETRIES) return null;
          return Math.min(times * 200, 1000);
        },
        maxRetriesPerRequest: 1,
      });

      // Required -- without a listener, every failed attempt throws an
      // unhandled 'error' event (visible in your Vercel logs) and can
      // crash the function invocation.
      client.on('error', (err: Error) => {
        console.warn('[CacheService] Redis error, falling back to in-memory cache:', err.message);
        _redisDisabled = true;
        _redisPromise = null;
      });

      client.on('end', () => {
        _redisDisabled = true;
        _redisPromise = null;
      });

      // Attempt the actual connection now (lazyConnect defers it until
      // this call) so we resolve/reject here rather than on the first
      // real cache read of the request.
      await client.connect();
      return client;
    } catch (err) {
      console.warn('[CacheService] Redis unavailable, using in-memory cache:', (err as Error).message);
      _redisDisabled = true;
      return null;
    }
  })();

  return _redisPromise;
}

// Exported so health check can use it
export const cacheConnection = new Proxy(
  {} as any,
  {
    get(_target, prop) {
      return async (...args: any[]) => {
        const redis = await getRedisPromise();
        if (redis) {
          return redis[prop as string](...args);
        }
        if (prop === 'ping') return 'PONG';
        return null;
      };
    },
  }
);

// Simple in-process LRU fallback
const memStore = new Map<string, { value: string; expires: number }>();

function memGet(key: string): string | null {
  const entry = memStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    memStore.delete(key);
    return null;
  }
  return entry.value;
}

function memSet(key: string, value: string, ttlSeconds: number): void {
  memStore.set(key, {
    value,
    expires: Date.now() + ttlSeconds * 1000,
  });
}

function memDel(key: string): void {
  memStore.delete(key);
}

function memKeys(pattern: string): string[] {
  const regex = new RegExp(
    '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
  );
  return Array.from(memStore.keys()).filter((k) => regex.test(k));
}

export class CacheService {
  private readonly defaultTTL = 300;

  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    const fullKey = this.buildKey(key, options);
    let raw: string | null = null;

    try {
      const redis = await getRedisPromise();
      raw = redis ? await redis.get(fullKey) : memGet(fullKey);
    } catch {
      // Redis call itself failed (e.g. died mid-request) -- fall back
      // rather than let this bubble up and crash the caller.
      _redisDisabled = true;
      _redisPromise = null;
      raw = memGet(fullKey);
    }

    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async set(
    key: string,
    value: unknown,
    options?: CacheOptions
  ): Promise<void> {
    const fullKey = this.buildKey(key, options);
    const ttl = options?.ttl || this.defaultTTL;
    const serialized =
      typeof value === 'string' ? value : JSON.stringify(value);

    try {
      const redis = await getRedisPromise();
      if (redis) {
        await redis.setex(fullKey, ttl, serialized);
      } else {
        memSet(fullKey, serialized, ttl);
      }
    } catch {
      _redisDisabled = true;
      _redisPromise = null;
      memSet(fullKey, serialized, ttl);
    }
  }

  async delete(key: string, options?: CacheOptions): Promise<void> {
    const fullKey = this.buildKey(key, options);
    try {
      const redis = await getRedisPromise();
      if (redis) {
        await redis.del(fullKey);
      } else {
        memDel(fullKey);
      }
    } catch {
      memDel(fullKey);
    }
  }

  async deletePattern(pattern: string): Promise<void> {
    try {
      const redis = await getRedisPromise();
      if (redis) {
        const keys: string[] = await redis.keys(pattern);
        if (keys.length > 0) await redis.del(...keys);
      } else {
        memKeys(pattern).forEach(memDel);
      }
    } catch {
      memKeys(pattern).forEach(memDel);
    }
  }

  async exists(key: string, options?: CacheOptions): Promise<boolean> {
    const fullKey = this.buildKey(key, options);
    try {
      const redis = await getRedisPromise();
      if (redis) {
        return (await redis.exists(fullKey)) === 1;
      }
      return memGet(fullKey) !== null;
    } catch {
      return memGet(fullKey) !== null;
    }
  }

  async invalidateTenantCache(tenantId: string): Promise<void> {
    await this.deletePattern(`*:${tenantId}:*`);
    await this.deletePattern(`cache:*:${tenantId}:*`);
  }

  private buildKey(key: string, options?: CacheOptions): string {
    const prefix = options?.prefix || 'cache';
    return `${prefix}:${key}`;
  }
}

export const cacheService = new CacheService();