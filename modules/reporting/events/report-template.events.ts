// modules/reporting/events/report-template.events.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { ReportTemplate } from '../types/report-template.types';

interface EventMeta {
  tenantId: string;
  userId: string;
}

export class ReportTemplateCreatedEvent extends DomainEvent {
  constructor(public readonly template: ReportTemplate, meta: EventMeta) {
    super('ReportTemplateCreated', {
      reportTemplateId: template._id,
      name: template.name,
      category: template.category,
    }, {
      tenantId: meta.tenantId,
      userId: meta.userId,
    });
  }
}

export class ReportTemplateDeletedEvent extends DomainEvent {
  constructor(public readonly reportTemplateId: string, public readonly name: string, tenantId: string, meta: { userId: string }) {
    super('ReportTemplateDeleted', { 
      reportTemplateId, 
      name 
    }, {
      tenantId,
      userId: meta.userId,
    });
  }
}