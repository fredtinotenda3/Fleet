// infrastructure/security/rate-limit.ts
//
// BACKLOG ITEM 3 (audit finding F-8).
//
// WHAT CHANGED
// ------------
//   * The module-level `Map` is gone. Counting now happens in
//     rate-limit-store.ts, which is Redis-backed when REDIS_URL is set
//     and in-memory otherwise. See that file for why a per-instance Map
//     counted nothing on Vercel.
//   * `checkLimit` is now ASYNC. It has to be: a distributed counter is
//     a network round trip. Every call site was updated; no synchronous
//     variant is kept, because leaving one would let a caller silently
//     opt back into per-instance limiting with no visible difference at
//     the call site.
//   * The key is built from `getClientIp` (client-ip.ts) instead of the
//     leftmost `x-forwarded-for` entry. A caller-chosen key means a
//     caller-chosen bucket, which defeats the limiter however good the
//     store is.
//
// The sliding-window semantics and the default 100/minute are unchanged.

import { NextRequest, NextResponse } from 'next/server';

import { getClientIp } from './client-ip';
import { getRateLimitStore } from './rate-limit-store';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: NextRequest) => string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number;
  /** Which store answered -- 'memory' in production means Redis is unreachable. */
  store: 'redis' | 'memory';
}

export class RateLimiter {
  private readonly defaultConfig: RateLimitConfig = {
    windowMs: 60_000,
    maxRequests: 100,
  };

  async checkLimit(
    req: NextRequest,
    config?: Partial<RateLimitConfig>
  ): Promise<RateLimitResult> {
    const finalConfig = {
      ...this.defaultConfig,
      ...config,
    };

    const key = this.getKey(req, finalConfig);

    const hit = await getRateLimitStore().hit(
      key,
      finalConfig.windowMs,
      finalConfig.maxRequests
    );

    return {
      allowed: hit.allowed,
      remaining: hit.remaining,
      reset: hit.reset,
      store: hit.store,
    };
  }

  /**
   * The bucket a request counts against.
   *
   * `getClientIp` applies the trusted-proxy model; an unattributable
   * request lands in the shared 'unknown' bucket rather than a
   * per-request one. A custom `keyGenerator` still wins -- the auth
   * pre-check route uses one to bucket by IP under its own namespace so
   * a credential-probing client cannot spend another route's budget.
   */
  private getKey(req: NextRequest, config: RateLimitConfig): string {
    if (config.keyGenerator) {
      return config.keyGenerator(req);
    }

    return `${getClientIp(req)}:${req.nextUrl.pathname}`;
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

  const { allowed, remaining, reset } = await rateLimiter.checkLimit(req, finalConfig);

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
          // Seconds, per RFC 9110 section 10.2.3. Without it a client
          // has to guess, and guessing clients retry immediately.
          'Retry-After': Math.max(1, Math.ceil((reset - Date.now()) / 1000)).toString(),
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
