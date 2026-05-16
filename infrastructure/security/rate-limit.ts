// infrastructure/security/rate-limit.ts

import { NextRequest, NextResponse } from 'next/server';
import { cacheConnection } from '@/infrastructure/cache/cache.service';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: NextRequest) => string;
}

export class RateLimiter {
  private defaultConfig: RateLimitConfig = {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60,
  };

  async checkLimit(req: NextRequest, config?: Partial<RateLimitConfig>): Promise<{ allowed: boolean; remaining: number; reset: number }> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const key = this.getKey(req, finalConfig);
    
    const now = Date.now();
    const windowStart = now - finalConfig.windowMs;
    
    // Clean old requests
    await cacheConnection.zremrangebyscore(key, 0, windowStart);
    
    // Count requests in window
    const count = await cacheConnection.zcard(key);
    
    if (count >= finalConfig.maxRequests) {
      const oldest = await cacheConnection.zrange(key, 0, 0, 'WITHSCORES');
      const reset = parseInt(oldest[1]) + finalConfig.windowMs;
      
      return {
        allowed: false,
        remaining: 0,
        reset,
      };
    }
    
    // Add current request
    await cacheConnection.zadd(key, now, `${now}-${Math.random()}`);
    await cacheConnection.expire(key, Math.ceil(finalConfig.windowMs / 1000));
    
    return {
      allowed: true,
      remaining: finalConfig.maxRequests - count - 1,
      reset: now + finalConfig.windowMs,
    };
  }

  private getKey(req: NextRequest, config: RateLimitConfig): string {
    if (config.keyGenerator) {
      return config.keyGenerator(req);
    }
    
    const ip = req.headers.get('x-forwarded-for') || req.ip || 'unknown';
    const path = req.nextUrl.pathname;
    return `rate-limit:${ip}:${path}`;
  }
}

export const rateLimiter = new RateLimiter();

export async function withRateLimit(
  req: NextRequest,
  handler: () => Promise<NextResponse>,
  config?: Partial<RateLimitConfig>
): Promise<NextResponse> {
  const { allowed, remaining, reset } = await rateLimiter.checkLimit(req, config);
  
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      { status: 429, headers: { 'X-RateLimit-Reset': reset.toString() } }
    );
  }
  
  const response = await handler();
  
  response.headers.set('X-RateLimit-Limit', config?.maxRequests?.toString() || '60');
  response.headers.set('X-RateLimit-Remaining', remaining.toString());
  response.headers.set('X-RateLimit-Reset', reset.toString());
  
  return response;
}