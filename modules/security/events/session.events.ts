// modules/security/events/session.events.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { SESSION_CREATED, SESSION_REVOKED } from '@/server/events/event-names';

export class SessionCreatedEvent extends DomainEvent {
  constructor(sessionId: string, userId: string, tenantId: string, metadata?: Record<string, unknown>) {
    super(
      SESSION_CREATED,
      { entityId: sessionId, entityType: 'session', userId, tenantId },
      metadata
    );
  }
}

export class SessionRevokedEvent extends DomainEvent {
  constructor(sessionRecordId: string, userId: string, tenantId: string, metadata?: Record<string, unknown>) {
    super(
      SESSION_REVOKED,
      { entityId: sessionRecordId, entityType: 'session', userId, tenantId },
      metadata
    );
  }
}