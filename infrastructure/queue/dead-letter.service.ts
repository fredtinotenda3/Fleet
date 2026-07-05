// infrastructure/queue/dead-letter.service.ts

import { BaseRepository } from '@/server/repositories/base.repository';
import { BaseEntity } from '@/shared/types/common.types';
import { monitoring } from '@/infrastructure/monitoring/logger';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { DomainEvent } from '@/server/events/base/DomainEvent';

export const JOB_DEAD_LETTERED = 'JobDeadLettered';

export interface DeadLetterEntry extends BaseEntity {
  originalQueue: string;
  jobType: string;
  jobId: string;
  payload: unknown;
  failedReason: string;
  attemptsMade: number;
  stacktrace?: string[];
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
}

class DeadLetterRepository extends BaseRepository<DeadLetterEntry> {
  protected collectionName = 'tbldeadletterqueue';

  async listUnresolved(tenantId: string, limit: number = 100) {
    return this.findMany({ resolved: { $ne: true } } as any, tenantId, {
      limit,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    }, false, true);
  }

  async markResolved(id: string, tenantId: string, userId: string) {
    return this.update(id, { resolved: true, resolvedAt: new Date(), resolvedBy: userId } as any, tenantId, userId, true);
  }
}

export const deadLetterRepository = new DeadLetterRepository();

/**
 * Records a permanently-failed job (all BullMQ retry attempts exhausted)
 * into an inspectable, queryable Mongo collection. BullMQ's own failed
 * set is a good crash-recovery mechanism but is awkward to page through
 * or search from an admin UI; this gives operators a normal repository
 * to work with, plus an audit trail and an event other modules (e.g.
 * SecurityAuditHandler-style alerting) can subscribe to.
 */
export class DeadLetterService {
  async record(params: {
    queueName: string;
    jobType: string;
    jobId: string;
    payload: unknown;
    failedReason: string;
    attemptsMade: number;
    stacktrace?: string[];
    tenantId: string;
  }): Promise<void> {
    const entry = await deadLetterRepository.create(
      {
        originalQueue: params.queueName,
        jobType: params.jobType,
        jobId: params.jobId,
        payload: params.payload,
        failedReason: params.failedReason,
        attemptsMade: params.attemptsMade,
        stacktrace: params.stacktrace,
        resolved: false,
         tenantId: params.tenantId, 
      },
      params.tenantId,
      'system'
    );

    monitoring.logError(`Job dead-lettered: ${params.jobType}`, undefined, {
      jobId: params.jobId,
      queue: params.queueName,
      reason: params.failedReason,
    });

    await auditLog.log({
      action: 'JOB_DEAD_LETTERED',
      userId: 'system',
      tenantId: params.tenantId,
      entityType: 'job',
      entityId: params.jobId,
      category: 'system',
      severity: 'critical',
      metadata: { jobType: params.jobType, queue: params.queueName, reason: params.failedReason },
    });

    const bus = EventBusFactory.getInstance();
    await bus.publish(
      new (class extends DomainEvent {
        constructor() {
          super(
            JOB_DEAD_LETTERED,
            { entityId: entry._id, entityType: 'job', jobType: params.jobType, queue: params.queueName },
            { tenantId: params.tenantId }
          );
        }
      })()
    );
  }

  async listUnresolved(tenantId: string, limit?: number) {
    return deadLetterRepository.listUnresolved(tenantId, limit);
  }

  async resolve(id: string, tenantId: string, userId: string) {
    return deadLetterRepository.markResolved(id, tenantId, userId);
  }
}

export const deadLetterService = new DeadLetterService();