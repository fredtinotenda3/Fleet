// modules/reporting/events/dashboard.events.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { Dashboard } from '../types/dashboard.types';

interface EventMeta {
  tenantId: string;
  userId: string;
}

export class DashboardCreatedEvent extends DomainEvent {
  constructor(public readonly dashboard: Dashboard, meta: EventMeta) {
    super('DashboardCreated', {
      dashboardId: dashboard._id,
      name: dashboard.name,
      isExecutive: dashboard.isExecutive,
    }, {
      tenantId: meta.tenantId,
      userId: meta.userId,
    });
  }
}

export class DashboardUpdatedEvent extends DomainEvent {
  constructor(
    public readonly dashboard: Dashboard,
    public readonly changes: Record<string, unknown>,
    meta: EventMeta
  ) {
    super('DashboardUpdated', { 
      dashboardId: dashboard._id, 
      changes 
    }, {
      tenantId: meta.tenantId,
      userId: meta.userId,
    });
  }
}

export class DashboardDeletedEvent extends DomainEvent {
  constructor(
    public readonly dashboardId: string,
    public readonly name: string,
    tenantId: string,
    meta: { userId: string }
  ) {
    super('DashboardDeleted', { 
      dashboardId, 
      name 
    }, {
      tenantId,
      userId: meta.userId,
    });
  }
}