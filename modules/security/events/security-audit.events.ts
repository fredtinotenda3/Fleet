// modules/security/events/security-audit.events.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import {
  SECURITY_LOGIN_SUCCESS,
  SECURITY_LOGIN_FAILED,
  SECURITY_BRUTE_FORCE_DETECTED,
  SECURITY_ACCOUNT_LOCKED,
  SECURITY_ACCOUNT_UNLOCKED,
  SECURITY_RATE_LIMIT_ANOMALY,
  AUDIT_CHAIN_INTEGRITY_FAILURE,
} from '@/server/events/event-names';

export class LoginSucceededEvent extends DomainEvent {
  constructor(
    email: string,
    userId: string,
    tenantId: string,
    ipAddress?: string,
    metadata?: Record<string, unknown>
  ) {
    super(
      SECURITY_LOGIN_SUCCESS,
      { entityType: 'auth', entityId: userId, email, ipAddress, tenantId },
      { tenantId, userId, ...metadata }
    );
  }
}

export class LoginFailedEvent extends DomainEvent {
  constructor(
    email: string,
    tenantId: string,
    ipAddress?: string,
    reason?: string,
    metadata?: Record<string, unknown>
  ) {
    super(
      SECURITY_LOGIN_FAILED,
      { entityType: 'auth', email, ipAddress, reason, tenantId },
      { tenantId, ...metadata }
    );
  }
}

export class BruteForceDetectedEvent extends DomainEvent {
  constructor(
    email: string,
    tenantId: string,
    ipAddress: string | undefined,
    failedAttempts: number,
    metadata?: Record<string, unknown>
  ) {
    super(
      SECURITY_BRUTE_FORCE_DETECTED,
      { entityType: 'auth', email, ipAddress, failedAttempts, tenantId },
      { tenantId, ...metadata }
    );
  }
}

export class AccountLockedEvent extends DomainEvent {
  constructor(
    email: string,
    tenantId: string,
    lockedUntil: Date,
    metadata?: Record<string, unknown>
  ) {
    super(
      SECURITY_ACCOUNT_LOCKED,
      { entityType: 'auth', email, lockedUntil, tenantId },
      { tenantId, ...metadata }
    );
  }
}

export class AccountUnlockedEvent extends DomainEvent {
  constructor(
    email: string,
    tenantId: string,
    unlockedBy: string,
    metadata?: Record<string, unknown>
  ) {
    super(
      SECURITY_ACCOUNT_UNLOCKED,
      { entityType: 'auth', email, unlockedBy, tenantId },
      { tenantId, userId: unlockedBy, ...metadata }
    );
  }
}

export class RateLimitAnomalyEvent extends DomainEvent {
  constructor(
    ipAddress: string,
    distinctEndpoints: number,
    tenantId: string,
    metadata?: Record<string, unknown>
  ) {
    super(
      SECURITY_RATE_LIMIT_ANOMALY,
      { entityType: 'rate_limit', ipAddress, distinctEndpoints, tenantId },
      { tenantId, ...metadata }
    );
  }
}

export class AuditChainIntegrityFailureEvent extends DomainEvent {
  constructor(
    brokenAtSequence: number,
    reason: string,
    tenantId: string = 'system',
    metadata?: Record<string, unknown>
  ) {
    super(
      AUDIT_CHAIN_INTEGRITY_FAILURE,
      { entityType: 'audit_log', brokenAtSequence, reason, tenantId },
      { tenantId, ...metadata }
    );
  }
}