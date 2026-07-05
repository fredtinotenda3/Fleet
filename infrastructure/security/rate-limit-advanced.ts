// infrastructure/security/rate-limit-advanced.ts
// Advanced sliding-window rate limiter backed by an in-memory store.
// Swap the store implementation to Redis for production multi-instance
// deployments (see infrastructure/cache/cache.service.ts).

import { NextRequest } from 'next/server';

type Tier = 'free' | 'professional' | 'enterprise';

interface WindowStore {
  get(key: string): number[];
  set(key: string, timestamps: number[]): void;
}

class InMemoryWindowStore implements WindowStore {
  private store = new Map<string, number[]>();

  get(key: string): number[] {
    return this.store.get(key) || [];
  }

  set(key: string, timestamps: number[]): void {
    this.store.set(key, timestamps);
  }
}

const store: WindowStore = new InMemoryWindowStore();

export class AdvancedRateLimiter {
  private readonly windowMs = 60_000;
  private readonly defaultLimit = 60;

  checkLimit(
    req: NextRequest,
    options: {
      limit?: number;
      windowMs?: number;
      key?: string;
      tier?: Tier;
    } = {}
  ): {
    allowed: boolean;
    remaining: number;
    reset: number;
    limit: number;
  } {
    const limit = this.getLimitForTier(options.tier || 'free', options.limit);
    const windowMs = options.windowMs || this.windowMs;
    const key = options.key || this.getKey(req);

    const now = Date.now();
    const windowStart = now - windowMs;

    const requests = store
      .get(key)
      .filter((t) => t > windowStart);

    if (requests.length >= limit) {
      return {
        allowed: false,
        remaining: 0,
        reset: (requests[0] || now) + windowMs,
        limit,
      };
    }

    requests.push(now);
    store.set(key, requests);

    return {
      allowed: true,
      remaining: limit - requests.length,
      reset: now + windowMs,
      limit,
    };
  }

  private getLimitForTier(tier: Tier, customLimit?: number): number {
    if (customLimit) return customLimit;
    switch (tier) {
      case 'free':
        return 30;
      case 'professional':
        return 100;
      case 'enterprise':
        return 500;
      default:
        return this.defaultLimit;
    }
  }

  /**
   * NextRequest in Next.js 15 no longer surfaces a typed top-level `.ip`
   * property (that was an Edge-runtime-only convenience that got
   * removed from the public type). Client IP now has to come from
   * proxy headers explicitly — `x-forwarded-for` (may contain a
   * comma-separated chain; the first entry is the original client) with
   * `x-real-ip` as a fallback for proxies that set that instead.
   */
  private getClientIp(req: NextRequest): string {
    const forwardedFor = req.headers.get('x-forwarded-for');
    if (forwardedFor) {
      return forwardedFor.split(',')[0]?.trim() || 'unknown';
    }
    return req.headers.get('x-real-ip') || 'unknown';
  }

  private getKey(req: NextRequest): string {
    const ip = this.getClientIp(req);
    const path = req.nextUrl.pathname;
    const method = req.method;
    return `rate-limit:${ip}:${method}:${path}`;
  }
}

export const advancedRateLimiter = new AdvancedRateLimiter();