// infrastructure/cache/cache.service.ts

import Redis from 'ioredis';

export const cacheConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export interface CacheOptions {
  ttl?: number; // seconds
  prefix?: string;
}

export class CacheService {
  private defaultTTL = 300; // 5 minutes

  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    const fullKey = this.buildKey(key, options);
    const data = await cacheConnection.get(fullKey);
    if (!data) return null;
    
    try {
      return JSON.parse(data) as T;
    } catch {
      return data as T;
    }
  }

  async set(key: string, value: any, options?: CacheOptions): Promise<void> {
    const fullKey = this.buildKey(key, options);
    const ttl = options?.ttl || this.defaultTTL;
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    await cacheConnection.setex(fullKey, ttl, serialized);
  }

  async delete(key: string, options?: CacheOptions): Promise<void> {
    const fullKey = this.buildKey(key, options);
    await cacheConnection.del(fullKey);
  }

  async deletePattern(pattern: string): Promise<void> {
    const keys = await cacheConnection.keys(pattern);
    if (keys.length > 0) {
      await cacheConnection.del(...keys);
    }
  }

  async exists(key: string, options?: CacheOptions): Promise<boolean> {
    const fullKey = this.buildKey(key, options);
    const result = await cacheConnection.exists(fullKey);
    return result === 1;
  }

  async increment(key: string, options?: CacheOptions): Promise<number> {
    const fullKey = this.buildKey(key, options);
    return await cacheConnection.incr(fullKey);
  }

  async expire(key: string, seconds: number, options?: CacheOptions): Promise<void> {
    const fullKey = this.buildKey(key, options);
    await cacheConnection.expire(fullKey, seconds);
  }

  private buildKey(key: string, options?: CacheOptions): string {
    const prefix = options?.prefix || 'cache';
    return `${prefix}:${key}`;
  }

  // Fleet-specific cache methods
  async getVehicleStats(tenantId: string) {
    return this.get(`vehicle:stats:${tenantId}`);
  }

  async setVehicleStats(tenantId: string, stats: any) {
    return this.set(`vehicle:stats:${tenantId}`, stats, { ttl: 60 }); // 1 minute
  }

  async getFleetKPIs(tenantId: string, dateRange: string) {
    return this.get(`fleet:kpis:${tenantId}:${dateRange}`);
  }

  async setFleetKPIs(tenantId: string, dateRange: string, kpis: any) {
    return this.set(`fleet:kpis:${tenantId}:${dateRange}`, kpis, { ttl: 300 }); // 5 minutes
  }

  async invalidateTenantCache(tenantId: string) {
    await this.deletePattern(`*:${tenantId}:*`);
    await this.deletePattern(`cache:*:${tenantId}:*`);
  }

  async invalidateVehicleCache(tenantId: string, vehicleId: string) {
    await this.deletePattern(`*:${tenantId}:${vehicleId}*`);
  }
}

export const cacheService = new CacheService();