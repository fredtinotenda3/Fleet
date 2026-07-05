// modules/dispatch/events/dispatch.events.ts
import { DomainEvent } from '@/server/events/base/DomainEvent';
import {
  DISPATCH_JOB_CREATED,
  DISPATCH_JOB_ASSIGNED,
  DISPATCH_JOB_STARTED,
  DISPATCH_JOB_COMPLETED,
  DISPATCH_JOB_CANCELLED,
} from '@/server/events/event-names';
import { DispatchJob } from '../types/dispatch.types';

export class DispatchJobCreatedEvent extends DomainEvent {
  constructor(job: DispatchJob, metadata?: Record<string, unknown>) {
    super(DISPATCH_JOB_CREATED, { entityId: job._id, entityType: 'dispatch_job', priority: job.priority, tenantId: job.tenantId }, metadata);
  }
}

export class DispatchJobAssignedEvent extends DomainEvent {
  constructor(job: DispatchJob, metadata?: Record<string, unknown>) {
    super(DISPATCH_JOB_ASSIGNED, { entityId: job._id, entityType: 'dispatch_job', driverId: job.assignedDriverId, vehicleId: job.assignedVehicleId, tenantId: job.tenantId }, metadata);
  }
}

export class DispatchJobStartedEvent extends DomainEvent {
  constructor(job: DispatchJob, metadata?: Record<string, unknown>) {
    super(DISPATCH_JOB_STARTED, { entityId: job._id, entityType: 'dispatch_job', tenantId: job.tenantId }, metadata);
  }
}

export class DispatchJobCompletedEvent extends DomainEvent {
  constructor(job: DispatchJob, metadata?: Record<string, unknown>) {
    super(DISPATCH_JOB_COMPLETED, { entityId: job._id, entityType: 'dispatch_job', tenantId: job.tenantId }, metadata);
  }
}

export class DispatchJobCancelledEvent extends DomainEvent {
  constructor(job: DispatchJob, metadata?: Record<string, unknown>) {
    super(DISPATCH_JOB_CANCELLED, { entityId: job._id, entityType: 'dispatch_job', reason: job.cancelledReason, tenantId: job.tenantId }, metadata);
  }
}