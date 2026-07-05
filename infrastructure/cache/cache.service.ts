// infrastructure/cache/cache.service.ts
// In-memory implementation used when REDIS_URL is absent.
// Automatically switches to Redis when REDIS_URL is present.

export interface CacheOptions {
  ttl?: number; // seconds
  prefix?: string;
}

// Lazy Redis singleton – now uses dynamic import 
let _redisPromise: Promise<any> | null = null;

function getRedisPromise(): Promise<any> {
  if (!process.env.REDIS_URL) return Promise.resolve(null);
  if (_redisPromise) return _redisPromise;
  _redisPromise = (async () => {
    try {
      const { default: Redis } = await import('ioredis');
      return new Redis(process.env.REDIS_URL!, { lazyConnect: true });
    } catch {
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
      // Return an async wrapper that resolves the Redis instance lazily
      return async (...args: any[]) => {
        const redis = await getRedisPromise();
        if (redis) {
          return redis[prop as string](...args);
        }
        // No-op for non-Redis environments
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
    const redis = await getRedisPromise();

    const raw = redis
      ? await redis.get(fullKey)
      : memGet(fullKey);

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

    const redis = await getRedisPromise();
    if (redis) {
      await redis.setex(fullKey, ttl, serialized);
    } else {
      memSet(fullKey, serialized, ttl);
    }
  }

  async delete(key: string, options?: CacheOptions): Promise<void> {
    const fullKey = this.buildKey(key, options);
    const redis = await getRedisPromise();
    if (redis) {
      await redis.del(fullKey);
    } else {
      memDel(fullKey);
    }
  }

  async deletePattern(pattern: string): Promise<void> {
    const redis = await getRedisPromise();
    if (redis) {
      const keys: string[] = await redis.keys(pattern);
      if (keys.length > 0) await redis.del(...keys);
    } else {
      memKeys(pattern).forEach(memDel);
    }
  }

  async exists(key: string, options?: CacheOptions): Promise<boolean> {
    const fullKey = this.buildKey(key, options);
    const redis = await getRedisPromise();
    if (redis) {
      return (await redis.exists(fullKey)) === 1;
    }
    return memGet(fullKey) !== null;
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