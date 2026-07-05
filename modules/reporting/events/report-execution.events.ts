// modules/reporting/events/report-execution.events.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { ReportExecution } from '../types/report-execution.types';

interface EventMeta {
  tenantId: string;
  userId: string;
}

export class ReportExecutionRequestedEvent extends DomainEvent {
  constructor(public readonly execution: ReportExecution, meta: EventMeta) {
    super('ReportExecutionRequested', {
      executionId: execution._id,
      format: execution.format,
      sourceType: execution.sourceType,
    }, {
      tenantId: meta.tenantId,
      userId: meta.userId,
    });
  }
}

export class ReportExecutionCompletedEvent extends DomainEvent {
  constructor(public readonly execution: ReportExecution, meta: EventMeta) {
    super('ReportExecutionCompleted', {
      executionId: execution._id,
      fileUrl: execution.fileUrl,
      format: execution.format,
    }, {
      tenantId: meta.tenantId,
      userId: meta.userId,
    });
  }
}

export class ReportExecutionFailedEvent extends DomainEvent {
  constructor(public readonly executionId: string, public readonly errorMessage: string, tenantId: string, meta: { userId: string }) {
    super('ReportExecutionFailed', { 
      executionId, 
      errorMessage 
    }, {
      tenantId,
      userId: meta.userId,
    });
  }
}