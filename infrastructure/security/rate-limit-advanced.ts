// infrastructure/security/rate-limit-advanced.ts
//
// Tier-aware sliding-window rate limiter.
//
// BACKLOG ITEM 3: its file header used to say "backed by an in-memory
// store -- swap the store implementation to Redis for production". That
// swap is now done, and it is the SAME store the primary limiter uses
// (rate-limit-store.ts) rather than a second private one: two limiters
// with two stores would give two different answers about the same
// client, and only one of them would be the one anybody looked at.
//
// The client-IP extraction that used to live here (`x-forwarded-for`,
// first entry, `x-real-ip` fallback) has moved to client-ip.ts for the
// reason documented there -- the first entry is client-supplied.

import { NextRequest } from 'next/server';

import { getClientIp } from './client-ip';
import { getRateLimitStore } from './rate-limit-store';

type Tier = 'free' | 'professional' | 'enterprise';

export class AdvancedRateLimiter {
  private readonly windowMs = 60_000;
  private readonly defaultLimit = 60;

  async checkLimit(
    req: NextRequest,
    options: {
      limit?: number;
      windowMs?: number;
      key?: string;
      tier?: Tier;
    } = {}
  ): Promise<{
    allowed: boolean;
    remaining: number;
    reset: number;
    limit: number;
    store: 'redis' | 'memory';
  }> {
    const limit = this.getLimitForTier(options.tier || 'free', options.limit);
    const windowMs = options.windowMs || this.windowMs;
    const key = options.key || this.getKey(req);

    const hit = await getRateLimitStore().hit(key, windowMs, limit);

    return {
      allowed: hit.allowed,
      remaining: hit.remaining,
      reset: hit.reset,
      limit,
      store: hit.store,
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
   * Method is part of the key here (and not in the primary limiter) so a
   * read budget and a write budget on the same path stay separate.
   */
  private getKey(req: NextRequest): string {
    const ip = getClientIp(req);
    const path = req.nextUrl.pathname;
    const method = req.method;
    return `adv:${ip}:${method}:${path}`;
  }
}

export const advancedRateLimiter = new AdvancedRateLimiter();
