// modules/security/events/CustomRoleCreatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { CUSTOM_ROLE_CREATED } from '@/server/events/event-names';
import { CustomRole } from '../types/custom-role.types';

export class CustomRoleCreatedEvent extends DomainEvent {
  constructor(role: CustomRole, metadata?: Record<string, unknown>) {
    super(CUSTOM_ROLE_CREATED, {
      entityId: role._id,
      entityType: 'custom_role',
      name: role.name,
      scopeType: role.scopeType,
      tenantId: role.organizationId,
    }, metadata);
  }
}