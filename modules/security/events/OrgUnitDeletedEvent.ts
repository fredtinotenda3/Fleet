// modules/security/events/OrgUnitDeletedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { ORG_UNIT_DELETED } from '@/server/events/event-names';

export class OrgUnitDeletedEvent extends DomainEvent {
  constructor(orgUnitId: string, name: string, tenantId: string, metadata?: Record<string, unknown>) {
    super(ORG_UNIT_DELETED, {
      entityId: orgUnitId,
      entityType: 'org_unit',
      name,
      tenantId,
    }, metadata);
  }
}