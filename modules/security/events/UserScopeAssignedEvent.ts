// modules/security/events/UserScopeAssignedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { USER_SCOPE_ASSIGNED } from '@/server/events/event-names';
import { UserScopeAssignment } from '../types/user-scope-assignment.types';

export class UserScopeAssignedEvent extends DomainEvent {
  constructor(assignment: UserScopeAssignment, metadata?: Record<string, unknown>) {
    super(USER_SCOPE_ASSIGNED, {
      entityId: assignment._id,
      entityType: 'user_scope_assignment',
      targetUserId: assignment.userId,
      orgUnitId: assignment.orgUnitId,
      role: assignment.role,
      tenantId: assignment.organizationId,
    }, metadata);
  }
}