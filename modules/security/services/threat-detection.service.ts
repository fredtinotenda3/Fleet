// modules/security/services/threat-detection.service.ts

import { loginAttemptRepository, LoginAttemptRepository } from '../repositories/login-attempt.repository';
import { RecordLoginAttemptInput, LoginAttemptResult } from '../types/threat-detection.types';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import {
  LoginSucceededEvent,
  LoginFailedEvent,
  BruteForceDetectedEvent,
  AccountLockedEvent,
  AccountUnlockedEvent,
  RateLimitAnomalyEvent,
} from '../events/security-audit.events';
import { cacheService } from '@/infrastructure/cache/cache.service';
import { monitoring } from '@/infrastructure/monitoring/logger';

const FAILED_ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const RATE_LIMIT_ANOMALY_WINDOW_SECONDS = 300; // 5 minutes
const RATE_LIMIT_ANOMALY_ENDPOINT_THRESHOLD = 5; // distinct endpoints

/**
 * Brute-force lockout and rate-limit anomaly detection. Sits alongside
 * (not instead of) the existing per-route rate limiter
 * (infrastructure/security/rate-limit.ts): that limiter throttles request
 * *rate*, this service watches for the *pattern* rate limiting alone
 * can't see — repeated failed logins against one account, or one IP
 * getting rate-limited across many different endpoints in a short
 * window, either of which suggests credential stuffing or a scanning
 * tool rather than an ordinary user tripping a legitimate limit once.
 */
export class ThreatDetectionService {
  constructor(private readonly repo: LoginAttemptRepository = loginAttemptRepository) {}

  async recordLoginAttempt(input: RecordLoginAttemptInput): Promise<LoginAttemptResult> {
    const email = input.email.toLowerCase();
    const eventBus = EventBusFactory.getInstance();

    await this.repo.recordAttempt({
      email,
      tenantId: input.tenantId,
      userId: input.userId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      success: input.success,
      attemptedAt: new Date(),
    });

    if (input.success) {
      const existingLockout = await this.repo.getLockout(email, input.tenantId);
      if (existingLockout && (existingLockout.failedCount > 0 || existingLockout.lockedUntil)) {
        await this.repo.clearLockout(email, input.tenantId);
      }

      await eventBus.publish(
        new LoginSucceededEvent(email, input.userId ?? email, input.tenantId, input.ipAddress, {
          userAgent: input.userAgent,
        })
      );

      return { locked: false, bruteForceDetected: false, failedCount: 0 };
    }

    const failedCount = await this.repo.getRecentFailedCount(
      email,
      input.tenantId,
      FAILED_ATTEMPT_WINDOW_MS
    );

    await this.repo.upsertLockout(email, input.tenantId, {
      failedCount,
      lastFailedAt: new Date(),
    });

    if (failedCount >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      await this.repo.upsertLockout(email, input.tenantId, { lockedUntil });

      await eventBus.publish(
        new BruteForceDetectedEvent(email, input.tenantId, input.ipAddress, failedCount, {
          userAgent: input.userAgent,
        })
      );
      await eventBus.publish(
        new AccountLockedEvent(email, input.tenantId, lockedUntil, { ipAddress: input.ipAddress })
      );

      return { locked: true, lockedUntil, bruteForceDetected: true, failedCount };
    }

    await eventBus.publish(
      new LoginFailedEvent(email, input.tenantId, input.ipAddress, 'invalid_credentials', {
        userAgent: input.userAgent,
        failedCount,
      })
    );

    return { locked: false, bruteForceDetected: false, failedCount };
  }

  async isLocked(email: string, tenantId: string): Promise<{ locked: boolean; lockedUntil?: Date }> {
    const lockout = await this.repo.getLockout(email.toLowerCase(), tenantId);
    if (!lockout?.lockedUntil) return { locked: false };

    if (lockout.lockedUntil.getTime() <= Date.now()) {
      // Lockout window naturally expired; clear it so later checks (and
      // the admin "locked accounts" listing) stop reporting it as locked.
      await this.repo.clearLockout(email.toLowerCase(), tenantId);
      return { locked: false };
    }

    return { locked: true, lockedUntil: lockout.lockedUntil };
  }

  async unlockAccount(email: string, tenantId: string, unlockedBy: string): Promise<void> {
    await this.repo.clearLockout(email.toLowerCase(), tenantId);

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new AccountUnlockedEvent(email.toLowerCase(), tenantId, unlockedBy));
  }

  async listLockedAccounts(tenantId?: string) {
    return this.repo.listLockedAccounts(tenantId);
  }

  /**
   * Called by server/middleware/with-auth.ts whenever the standard rate
   * limiter rejects a request. Tracks, per IP, the set of distinct
   * endpoint paths that have triggered a 429 within a rolling window; an
   * ordinary user hitting one endpoint too fast looks nothing like a
   * scanner probing many endpoints from the same address, which is the
   * pattern this flags.
   */
  async recordRateLimitBlock(ipAddress: string, path: string, tenantId: string): Promise<void> {
    if (!ipAddress || ipAddress === 'unknown') return;

    const cacheKey = `threat:rl:${ipAddress}`;
    try {
      const existing = await cacheService.get<string[]>(cacheKey);
      const endpoints = new Set(existing || []);
      endpoints.add(path);

      await cacheService.set(cacheKey, Array.from(endpoints), {
        ttl: RATE_LIMIT_ANOMALY_WINDOW_SECONDS,
      });

      if (endpoints.size >= RATE_LIMIT_ANOMALY_ENDPOINT_THRESHOLD) {
        const eventBus = EventBusFactory.getInstance();
        await eventBus.publish(
          new RateLimitAnomalyEvent(ipAddress, endpoints.size, tenantId, {
            endpoints: Array.from(endpoints),
          })
        );
        // Reset so we don't re-fire on every subsequent request from an
        // address that keeps scanning.
        await cacheService.delete(cacheKey);
      }
    } catch (error) {
      monitoring.logError(
        '[ThreatDetectionService] Failed to track rate-limit anomaly',
        error as Error,
        { ipAddress, path }
      );
    }
  }
}

export const threatDetectionService = new ThreatDetectionService();