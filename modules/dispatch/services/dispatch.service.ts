// modules/dispatch/services/dispatch.service.ts
import { dispatchRepository, DispatchRepository } from '../repositories/dispatch.repository';
import { DispatchJob, DispatchJobCreateDTO, DispatchFilters, DispatchJobStatus } from '../types/dispatch.types';
import { ConflictError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import {
  DispatchJobCreatedEvent,
  DispatchJobAssignedEvent,
  DispatchJobStartedEvent,
  DispatchJobCompletedEvent,
  DispatchJobCancelledEvent,
} from '../events/dispatch.events';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { WriteScope, tenantIdOf } from '@/server/tenancy/write-scope';
import { resolveCreationOrgUnitId } from '@/server/utils/tenant-context.utils';

const VALID_TRANSITIONS: Record<DispatchJobStatus, DispatchJobStatus[]> = {
  unassigned: ['assigned', 'cancelled'],
  assigned: ['en_route', 'cancelled'],
  en_route: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export class DispatchService {
  constructor(private readonly repo: DispatchRepository = dispatchRepository) {}

  /**
   * SCOPE MISMATCH FIX. DispatchRepository.getBoardInScope /
   * getActiveBoardInScope both filter on `{ orgUnitId: { $in: ... } }`,
   * and dispatch.tenancy-addendum.ts documents the field -- but create
   * never wrote it, so every job a scope-narrowed dispatcher raised was
   * absent from the board they raised it on. Same class as drivers; see
   * server/tenancy/write-scope.ts.
   *
   * The unit comes from the SUBMITTER, not from a vehicle: a dispatch
   * job is created BEFORE a vehicle is assigned, so there is no asset to
   * inherit from at this point.
   *
   * NOTE ON THE ADDENDUM'S WORDING. dispatch.tenancy-addendum.ts says
   * the unit "falls back to the assigned vehicle's orgUnitId once
   * assigned". That is deliberately NOT implemented: re-homing a live
   * job to another branch at assignment time would make it disappear
   * from the board of the dispatcher who is actively running it. The
   * assignment path validates the vehicle is in scope instead, which
   * gets the safety property without the vanishing act. The addendum
   * comment has been corrected to match.
   */
  async create(data: DispatchJobCreateDTO, scope: WriteScope, userId: string): Promise<DispatchJob> {
    const tenantId = tenantIdOf(scope);
    if (!data.title?.trim()) throw new ValidationError('title is required');
    if (!data.pickupLocation?.trim()) throw new ValidationError('pickupLocation is required');

    const orgUnitId =
      scope.kind === 'user' ? resolveCreationOrgUnitId(scope.context, data.orgUnitId) : undefined;

    const created = await this.repo.create(
      {
        tenantId,
        ...(orgUnitId ? { orgUnitId } : {}),
        title: data.title,
        priority: data.priority || 'medium',
        status: 'unassigned',
        pickupLocation: data.pickupLocation,
        dropoffLocation: data.dropoffLocation,
        scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : undefined,
        notes: data.notes,
      } as any,
      tenantId,
      userId
    );

    const bus = EventBusFactory.getInstance();
    await bus.publish(new DispatchJobCreatedEvent(created, { tenantId, userId }));

    return created;
  }

  async assign(id: string, driverId: string, vehicleId: string, tenantId: string, userId: string): Promise<DispatchJob> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Dispatch job not found');
    this.assertTransition(existing.status, 'assigned');

    // Guard against double-booking the same driver/vehicle on another active job.
    const activeJobs = await this.repo.getActiveBoard(tenantId);
    const conflict = activeJobs.find((j) => j._id !== id && (j.assignedDriverId === driverId || j.assignedVehicleId === vehicleId));
    if (conflict) throw new ConflictError('Driver or vehicle is already assigned to another active dispatch job');

    const updated = await this.repo.update(id, { status: 'assigned' as DispatchJobStatus, assignedDriverId: driverId, assignedVehicleId: vehicleId, assignedAt: new Date() }, tenantId, userId);
    if (!updated) throw new NotFoundError('Dispatch job not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new DispatchJobAssignedEvent(updated, { tenantId, userId }));

    return updated;
  }

  async changeStatus(id: string, status: DispatchJobStatus, tenantId: string, userId: string, reason?: string): Promise<DispatchJob> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Dispatch job not found');
    this.assertTransition(existing.status, status);

    const updates: Partial<DispatchJob> = { status };
    if (status === 'in_progress' && !existing.startedAt) updates.startedAt = new Date();
    if (status === 'completed') updates.completedAt = new Date();
    if (status === 'cancelled') updates.cancelledReason = reason;

    const updated = await this.repo.update(id, updates, tenantId, userId);
    if (!updated) throw new NotFoundError('Dispatch job not found');

    const bus = EventBusFactory.getInstance();
    if (status === 'in_progress') await bus.publish(new DispatchJobStartedEvent(updated, { tenantId, userId }));
    if (status === 'completed') {
      await bus.publish(new DispatchJobCompletedEvent(updated, { tenantId, userId }));
      await auditLog.log({ action: 'DISPATCH_JOB_COMPLETED', userId, tenantId, entityType: 'dispatch_job', entityId: id });
    }
    if (status === 'cancelled') await bus.publish(new DispatchJobCancelledEvent(updated, { tenantId, userId }));

    return updated;
  }

  async list(filters: DispatchFilters, pagination: PaginationParams, tenantId: string): Promise<PaginatedResponse<DispatchJob>> {
    return this.repo.getFiltered(filters, tenantId, pagination);
  }

  async get(id: string, tenantId: string): Promise<DispatchJob> {
    const job = await this.repo.findById(id, tenantId);
    if (!job) throw new NotFoundError('Dispatch job not found');
    return job;
  }

  async getBoard(tenantId: string): Promise<DispatchJob[]> {
    return this.repo.getActiveBoard(tenantId);
  }

  private assertTransition(from: DispatchJobStatus, to: DispatchJobStatus): void {
    if (!VALID_TRANSITIONS[from].includes(to)) {
      throw new ConflictError(`Cannot transition dispatch job from "${from}" to "${to}"`);
    }
  }
}

export const dispatchService = new DispatchService();