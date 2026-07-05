// modules/security/events/OrgUnitUpdatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { ORG_UNIT_UPDATED } from '@/server/events/event-names';
import { OrgUnit, OrgUnitUpdateDTO } from '../types/org-unit.types';

export class OrgUnitUpdatedEvent extends DomainEvent {
  constructor(orgUnit: OrgUnit, changes: OrgUnitUpdateDTO, metadata?: Record<string, unknown>) {
    super(ORG_UNIT_UPDATED, {
      entityId: orgUnit._id,
      entityType: 'org_unit',
      name: orgUnit.name,
      changes,
      tenantId: orgUnit.organizationId,
    }, metadata);
  }
}