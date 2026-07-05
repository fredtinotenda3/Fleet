// modules/security/events/CustomRoleUpdatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { CUSTOM_ROLE_UPDATED } from '@/server/events/event-names';
import { CustomRole, CustomRoleUpdateDTO } from '../types/custom-role.types';

export class CustomRoleUpdatedEvent extends DomainEvent {
  constructor(role: CustomRole, changes: CustomRoleUpdateDTO, metadata?: Record<string, unknown>) {
    super(CUSTOM_ROLE_UPDATED, {
      entityId: role._id,
      entityType: 'custom_role',
      name: role.name,
      version: role.version,
      changes,
      tenantId: role.organizationId,
    }, metadata);
  }
}