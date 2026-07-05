// modules/reporting/events/kpi-definition.events.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { KPIDefinition } from '../types/kpi.types';

interface EventMeta {
  tenantId: string;
  userId: string;
}

export class KpiDefinitionCreatedEvent extends DomainEvent {
  constructor(public readonly kpi: KPIDefinition, meta: EventMeta) {
    super('KpiDefinitionCreated', { 
      kpiDefinitionId: kpi._id, 
      name: kpi.name 
    }, {
      tenantId: meta.tenantId,
      userId: meta.userId,
    });
  }
}

export class KpiDefinitionUpdatedEvent extends DomainEvent {
  constructor(public readonly kpi: KPIDefinition, public readonly changes: Record<string, unknown>, meta: EventMeta) {
    super('KpiDefinitionUpdated', { 
      kpiDefinitionId: kpi._id, 
      changes 
    }, {
      tenantId: meta.tenantId,
      userId: meta.userId,
    });
  }
}

export class KpiDefinitionDeletedEvent extends DomainEvent {
  constructor(public readonly kpiDefinitionId: string, public readonly name: string, tenantId: string, meta: { userId: string }) {
    super('KpiDefinitionDeleted', { 
      kpiDefinitionId, 
      name 
    }, {
      tenantId,
      userId: meta.userId,
    });
  }
}