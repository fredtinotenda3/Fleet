// modules/reporting/events/report-definition.events.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { ReportDefinition } from '../types/report-definition.types';

interface EventMeta {
  tenantId: string;
  userId: string;
}

export class ReportDefinitionCreatedEvent extends DomainEvent {
  constructor(public readonly definition: ReportDefinition, meta: EventMeta) {
    super('ReportDefinitionCreated', {
      reportDefinitionId: definition._id,
      name: definition.name,
      dataSource: definition.dataSource,
    }, {
      tenantId: meta.tenantId,
      userId: meta.userId,
    });
  }
}

export class ReportDefinitionUpdatedEvent extends DomainEvent {
  constructor(
    public readonly definition: ReportDefinition,
    public readonly changes: Record<string, unknown>,
    meta: EventMeta
  ) {
    super('ReportDefinitionUpdated', {
      reportDefinitionId: definition._id,
      changes,
    }, {
      tenantId: meta.tenantId,
      userId: meta.userId,
    });
  }
}

export class ReportDefinitionDeletedEvent extends DomainEvent {
  constructor(
    public readonly reportDefinitionId: string,
    public readonly name: string,
    tenantId: string,
    meta: { userId: string }
  ) {
    super('ReportDefinitionDeleted', { 
      reportDefinitionId, 
      name 
    }, {
      tenantId,
      userId: meta.userId,
    });
  }
}
























































