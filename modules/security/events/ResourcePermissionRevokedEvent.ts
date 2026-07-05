// modules/security/events/ResourcePermissionRevokedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { RESOURCE_PERMISSION_REVOKED } from '@/server/events/event-names';

export class ResourcePermissionRevokedEvent extends DomainEvent {
  constructor(
    grantId: string,
    subjectId: string,
    permission: string,
    tenantId: string,
    metadata?: Record<string, unknown>
  ) {
    super(RESOURCE_PERMISSION_REVOKED, {
      entityId: grantId,
      entityType: 'resource_permission',
      subjectId,
      permission,
      tenantId,
    }, metadata);
  }
}