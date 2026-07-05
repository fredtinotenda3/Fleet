// modules/security/events/UserScopeRevokedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { USER_SCOPE_REVOKED } from '@/server/events/event-names';

export class UserScopeRevokedEvent extends DomainEvent {
  constructor(
    assignmentId: string,
    targetUserId: string,
    orgUnitId: string,
    tenantId: string,
    metadata?: Record<string, unknown>
  ) {
    super(USER_SCOPE_REVOKED, {
      entityId: assignmentId,
      entityType: 'user_scope_assignment',
      targetUserId,
      orgUnitId,
      tenantId,
    }, metadata);
  }
}