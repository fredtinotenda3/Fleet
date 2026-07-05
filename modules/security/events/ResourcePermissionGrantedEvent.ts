// modules/security/events/ResourcePermissionGrantedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { RESOURCE_PERMISSION_GRANTED } from '@/server/events/event-names';
import { ResourcePermission } from '../types/resource-permission.types';

export class ResourcePermissionGrantedEvent extends DomainEvent {
  constructor(grant: ResourcePermission, metadata?: Record<string, unknown>) {
    super(RESOURCE_PERMISSION_GRANTED, {
      entityId: grant._id,
      entityType: 'resource_permission',
      subjectType: grant.subjectType,
      subjectId: grant.subjectId,
      permission: grant.permission,
      effect: grant.effect,
      resourceType: grant.resourceType,
      resourceId: grant.resourceId,
      tenantId: grant.organizationId,
    }, metadata);
  }
}