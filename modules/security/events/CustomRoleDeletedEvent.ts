// modules/security/events/CustomRoleDeletedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { CUSTOM_ROLE_DELETED } from '@/server/events/event-names';

export class CustomRoleDeletedEvent extends DomainEvent {
  constructor(roleId: string, name: string, tenantId: string, metadata?: Record<string, unknown>) {
    super(CUSTOM_ROLE_DELETED, {
      entityId: roleId,
      entityType: 'custom_role',
      name,
      tenantId,
    }, metadata);
  }
}