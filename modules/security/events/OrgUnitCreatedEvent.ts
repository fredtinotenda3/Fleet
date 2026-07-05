// modules/security/events/OrgUnitCreatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { ORG_UNIT_CREATED } from '@/server/events/event-names';
import { OrgUnit } from '../types/org-unit.types';

export class OrgUnitCreatedEvent extends DomainEvent {
  constructor(orgUnit: OrgUnit, metadata?: Record<string, unknown>) {
    super(ORG_UNIT_CREATED, {
      entityId: orgUnit._id,
      entityType: 'org_unit',
      name: orgUnit.name,
      type: orgUnit.type,
      parentId: orgUnit.parentId,
      tenantId: orgUnit.organizationId,
    }, metadata);
  }
}