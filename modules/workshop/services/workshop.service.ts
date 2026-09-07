// modules/workshop/services/workshop.service.ts
import { workshopBayRepository, WorkshopBayRepository, mechanicAssignmentRepository, MechanicAssignmentRepository } from '../repositories/workshop.repository';
import { WorkshopBay, WorkshopBayCreateDTO, WorkshopBayUpdateDTO, MechanicAssignment } from '../types/workshop.types';
import { ConflictError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { WorkshopBayCreatedEvent, WorkshopBayStatusChangedEvent, MechanicAssignedEvent, MechanicUnassignedEvent } from '../events/workshop.events';
import { WriteScope, tenantIdOf } from '@/server/tenancy/write-scope';
import { resolveCreationOrgUnitId } from '@/server/utils/tenant-context.utils';

export class WorkshopService {
  constructor(
    private readonly bayRepo: WorkshopBayRepository = workshopBayRepository,
    private readonly assignmentRepo: MechanicAssignmentRepository = mechanicAssignmentRepository
  ) {}

  /**
   * SCOPE MISMATCH FIX. WorkshopRepository.getFilteredInScope and
   * getAvailableInScope filter on orgUnitId and createBay never wrote
   * it, so a workshop manager saw none of their own bays -- including
   * in the "available bay" picker that work-order scheduling depends
   * on. Same class as drivers; see server/tenancy/write-scope.ts.
   *
   * A bay is part of a workshop, so it takes the SUBMITTER's unit.
   */
  async createBay(data: WorkshopBayCreateDTO, scope: WriteScope, userId: string): Promise<WorkshopBay> {
    const tenantId = tenantIdOf(scope);
    if (!data.bayNumber?.trim()) throw new ValidationError('Bay number is required');

    const orgUnitId =
      scope.kind === 'user'
        ? resolveCreationOrgUnitId(scope.context, (data as { orgUnitId?: unknown }).orgUnitId)
        : undefined;

    const created = await this.bayRepo.create(
      {
        tenantId,
        ...(orgUnitId ? { orgUnitId } : {}),
        name: data.name,
        bayNumber: data.bayNumber,
        status: 'available',
        capabilities: data.capabilities || [],
        currentMechanicIds: [],
      } as any,
      tenantId,
      userId
    );

    const bus = EventBusFactory.getInstance();
    await bus.publish(new WorkshopBayCreatedEvent(created, { tenantId, userId }));

    return created;
  }

  async updateBay(id: string, data: WorkshopBayUpdateDTO, tenantId: string, userId: string): Promise<WorkshopBay> {
    const existing = await this.bayRepo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Workshop bay not found');

    const statusChanged = data.status && data.status !== existing.status;
    const updated = await this.bayRepo.update(id, data as Partial<WorkshopBay>, tenantId, userId);
    if (!updated) throw new NotFoundError('Workshop bay not found');

    if (statusChanged) {
      const bus = EventBusFactory.getInstance();
      await bus.publish(new WorkshopBayStatusChangedEvent(updated, existing.status, { tenantId, userId }));
    }

    return updated;
  }

  async listBays(status: string | undefined, pagination: PaginationParams, tenantId: string): Promise<PaginatedResponse<WorkshopBay>> {
    return this.bayRepo.getFiltered(status, tenantId, pagination);
  }

  async getBay(id: string, tenantId: string): Promise<WorkshopBay> {
    const bay = await this.bayRepo.findById(id, tenantId);
    if (!bay) throw new NotFoundError('Workshop bay not found');
    return bay;
  }

  async assignMechanic(mechanicId: string, bayId: string | undefined, workOrderId: string | undefined, tenantId: string, userId: string): Promise<MechanicAssignment> {
    const active = await this.assignmentRepo.findActiveForMechanic(mechanicId, tenantId);
    if (active.length > 0) throw new ConflictError('Mechanic already has an active assignment');

    let bayOrgUnitId: string | undefined;
    if (bayId) {
      const bay = await this.bayRepo.findById(bayId, tenantId);
      if (!bay) throw new NotFoundError('Workshop bay not found');
      if (bay.status === 'occupied') throw new ConflictError('Bay is already occupied');
      bayOrgUnitId = bay.orgUnitId;
      await this.bayRepo.update(bayId, { status: 'occupied', currentWorkOrderId: workOrderId, currentMechanicIds: [...bay.currentMechanicIds, mechanicId] }, tenantId, userId);
    }

    /**
     * workshop.tenancy-addendum.ts documents MechanicAssignment.orgUnitId
     * as "denormalized from the parent WorkshopBay's orgUnitId at
     * creation time". That denormalization was never actually performed
     * -- the same shape of gap as WorkOrderService's documented-but-
     * unwired vehicle fallback. Now wired.
     *
     * An assignment made with no bay (a mechanic assigned straight to a
     * work order) has no parent to inherit from and is left unset
     * rather than guessed; the addendum's contract is bay-derived and
     * inventing a unit here would put the assignment in a workshop it
     * has no relationship to.
     */
    const created = await this.assignmentRepo.create(
      {
        tenantId,
        ...(bayOrgUnitId ? { orgUnitId: bayOrgUnitId } : {}),
        mechanicId,
        bayId,
        workOrderId,
        assignedAt: new Date(),
      } as any,
      tenantId,
      userId
    );

    const bus = EventBusFactory.getInstance();
    await bus.publish(new MechanicAssignedEvent(created, { tenantId, userId }));

    return created;
  }

  async releaseMechanic(assignmentId: string, tenantId: string, userId: string): Promise<MechanicAssignment> {
    const assignment = await this.assignmentRepo.findById(assignmentId, tenantId);
    if (!assignment) throw new NotFoundError('Assignment not found');
    if (assignment.releasedAt) throw new ConflictError('Assignment already released');

    const updated = await this.assignmentRepo.update(assignmentId, { releasedAt: new Date() }, tenantId, userId);
    if (!updated) throw new NotFoundError('Assignment not found');

    if (assignment.bayId) {
      const bay = await this.bayRepo.findById(assignment.bayId, tenantId);
      if (bay) {
        const remainingMechanics = bay.currentMechanicIds.filter((m) => m !== assignment.mechanicId);
        await this.bayRepo.update(
          assignment.bayId,
          { currentMechanicIds: remainingMechanics, ...(remainingMechanics.length === 0 && { status: 'available', currentWorkOrderId: undefined }) },
          tenantId,
          userId
        );
      }
    }

    const bus = EventBusFactory.getInstance();
    await bus.publish(new MechanicUnassignedEvent(updated, { tenantId, userId }));

    return updated;
  }
}

export const workshopService = new WorkshopService();