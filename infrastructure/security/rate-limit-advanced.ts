// infrastructure/security/rate-limit-advanced.ts

import { NextRequest, NextResponse } from 'next/server';
import { cacheConnection } from '@/infrastructure/cache/cache.service';

export class AdvancedRateLimiter {
  private readonly WINDOW_MS = 60 * 1000; // 1 minute
  private readonly DEFAULT_LIMIT = 60;
  
  async checkLimit(
    req: NextRequest,
    options: {
      limit?: number;
      windowMs?: number;
      key?: string;
      tier?: 'free' | 'professional' | 'enterprise';
    } = {}
  ): Promise<{ allowed: boolean; remaining: number; reset: number; limit: number }> {
    const limit = this.getLimitForTier(options.tier || 'free', options.limit);
    const windowMs = options.windowMs || this.WINDOW_MS;
    const key = options.key || this.getKey(req);
    
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean old entries
    await cacheConnection.zremrangebyscore(key, 0, windowStart);
    
    const count = await cacheConnection.zcard(key);
    
    if (count >= limit) {
      const oldest = await cacheConnection.zrange(key, 0, 0, 'WITHSCORES');
      const reset = parseInt(oldest[1]) + windowMs;
      
      return { allowed: false, remaining: 0, reset, limit };
    }
    
    await cacheConnection.zadd(key, now, `${now}-${Math.random()}`);
    await cacheConnection.expire(key, Math.ceil(windowMs / 1000));
    
    return {
      allowed: true,
      remaining: limit - count - 1,
      reset: now + windowMs,
      limit,
    };
  }
  
  private getLimitForTier(tier: string, customLimit?: number): number {
    if (customLimit) return customLimit;
    
    switch (tier) {
      case 'free': return 30;
      case 'professional': return 100;
      case 'enterprise': return 500;
      default: return this.DEFAULT_LIMIT;
    }
  }
  
  private getKey(req: NextRequest): string {
    const ip = req.headers.get('x-forwarded-for') || req.ip || 'unknown';
    const tenantId = (req as any).tenantId || 'default';
    const path = req.nextUrl.pathname;
    const method = req.method;
    
    return `rate-limit:${tenantId}:${ip}:${method}:${path}`;
  }
}

export const advancedRateLimiter = new AdvancedRateLimiter();