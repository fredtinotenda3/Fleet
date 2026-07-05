// infrastructure/security/rate-limit.ts

import { NextRequest, NextResponse } from 'next/server';

// In-memory store (replace with Redis in production)
const requestStore = new Map<string, number[]>();

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: NextRequest) => string;
}

export class RateLimiter {
  private readonly defaultConfig: RateLimitConfig = {
    windowMs: 60_000,
    maxRequests: 100,
  };

  checkLimit(
    req: NextRequest,
    config?: Partial<RateLimitConfig>
  ): { allowed: boolean; remaining: number; reset: number } {
    const finalConfig = {
      ...this.defaultConfig,
      ...config,
    };

    const key = this.getKey(req, finalConfig);

    const now = Date.now();
    const windowStart = now - finalConfig.windowMs;

    const requests = (requestStore.get(key) ?? []).filter(
      (timestamp) => timestamp > windowStart
    );

    if (requests.length >= finalConfig.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        reset: (requests[0] ?? now) + finalConfig.windowMs,
      };
    }

    requests.push(now);
    requestStore.set(key, requests);

    return {
      allowed: true,
      remaining: finalConfig.maxRequests - requests.length,
      reset: now + finalConfig.windowMs,
    };
  }

  private getKey(req: NextRequest, config: RateLimitConfig): string {
    if (config.keyGenerator) {
      return config.keyGenerator(req);
    }

    // Next.js no longer exposes req.ip.
    // Try the standard proxy headers.
    const forwardedFor = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');

    const ip =
      forwardedFor?.split(',')[0].trim() ??
      realIp ??
      'unknown';

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
  const finalConfig = {
    windowMs: 60_000,
    maxRequests: 100,
    ...config,
  };

  const { allowed, remaining, reset } = rateLimiter.checkLimit(
    req,
    finalConfig
  );

  if (!allowed) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests',
        },
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': finalConfig.maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': reset.toString(),
        },
      }
    );
  }

  const response = await handler();

  response.headers.set(
    'X-RateLimit-Limit',
    finalConfig.maxRequests.toString()
  );
  response.headers.set(
    'X-RateLimit-Remaining',
    remaining.toString()
  );
  response.headers.set(
    'X-RateLimit-Reset',
    reset.toString()
  );

  return response;
}