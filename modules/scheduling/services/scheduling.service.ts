// modules/scheduling/services/scheduling.service.ts
import { driverShiftRepository, DriverShiftRepository } from '../repositories/scheduling.repository';
import { DriverShift, DriverShiftCreateDTO, DriverShiftFilters, ShiftStatus } from '../types/scheduling.types';
import { ConflictError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { DriverShiftCreatedEvent, DriverShiftUpdatedEvent, DriverShiftCancelledEvent } from '../events/scheduling.events';
import { WriteScope, tenantIdOf } from '@/server/tenancy/write-scope';
import { driverRepository } from '@/modules/drivers/repositories/driver.repository';
import { resolveAlertOwnership } from '@/modules/telematics/services/alert-ownership.resolver';
import '@/shared/types/driver.tenancy-addendum';

export class SchedulingService {
  constructor(private readonly repo: DriverShiftRepository = driverShiftRepository) {}

  /**
   * TWO FIXES.
   *
   * 1. SCOPE MISMATCH. SchedulingRepository's scoped reads apply the
   *    org-unit predicate on `orgUnitId`, and scheduling.tenancy-addendum.ts
   *    documents the field as "Inherited from the rostered driver; falls
   *    back to the assigned vehicle" -- but createShift never wrote it,
   *    so a department manager's own roster was empty to them. The
   *    addendum's own header notes that leaving this unscoped let any
   *    department manager EDIT another department's shifts, which makes
   *    the missing write the more serious half. Same class as drivers;
   *    see server/tenancy/write-scope.ts.
   * 2. NO DRIVER EXISTENCE CHECK. `driverId` was stored unvalidated, so
   *    a stale or cross-tenant id saved cleanly and surfaced later as a
   *    broken join in the roster view -- the same gap the trip handlers
   *    had closed for themselves.
   *
   * The addendum's documented fallback order (driver, then vehicle) is
   * implemented here as written.
   */
  async createShift(data: DriverShiftCreateDTO, scope: WriteScope, userId: string): Promise<DriverShift> {
    const tenantId = tenantIdOf(scope);
    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);
    if (endTime <= startTime) throw new ValidationError('endTime must be after startTime');

    const driver = await driverRepository.findById(String(data.driverId), tenantId);
    if (!driver) throw new NotFoundError('Driver not found');

    let orgUnitId: string | undefined = driver.orgUnitId;
    if (!orgUnitId && data.vehicleId) {
      const ownership = await resolveAlertOwnership(String(data.vehicleId), tenantId);
      orgUnitId = ownership.orgUnitId;
    }

    const overlapping = await this.repo.findOverlappingForDriver(data.driverId, startTime, endTime, tenantId);
    if (overlapping.length > 0) throw new ConflictError('Driver already has an overlapping shift scheduled');

    const created = await this.repo.create(
      {
        tenantId,
        ...(orgUnitId ? { orgUnitId } : {}),
        driverId: data.driverId,
        vehicleId: data.vehicleId,
        startTime,
        endTime,
        status: 'scheduled',
        notes: data.notes,
      } as any,
      tenantId,
      userId
    );

    const bus = EventBusFactory.getInstance();
    await bus.publish(new DriverShiftCreatedEvent(created, { tenantId, userId }));

    return created;
  }

  async updateShift(id: string, data: Partial<DriverShiftCreateDTO>, tenantId: string, userId: string): Promise<DriverShift> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Shift not found');
    if (existing.status !== 'scheduled') throw new ConflictError('Only scheduled shifts can be modified');

    const startTime = data.startTime ? new Date(data.startTime) : existing.startTime;
    const endTime = data.endTime ? new Date(data.endTime) : existing.endTime;
    if (endTime <= startTime) throw new ValidationError('endTime must be after startTime');

    if (data.startTime || data.endTime) {
      const overlapping = await this.repo.findOverlappingForDriver(existing.driverId, startTime, endTime, tenantId, id);
      if (overlapping.length > 0) throw new ConflictError('Driver already has an overlapping shift scheduled');
    }

    const updated = await this.repo.update(id, { ...data, startTime, endTime } as Partial<DriverShift>, tenantId, userId);
    if (!updated) throw new NotFoundError('Shift not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new DriverShiftUpdatedEvent(updated, data as Partial<DriverShift>, { tenantId, userId }));

    return updated;
  }

  async startShift(id: string, tenantId: string, userId: string): Promise<DriverShift> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Shift not found');
    if (existing.status !== 'scheduled') throw new ConflictError(`Cannot start a shift in status "${existing.status}"`);

    const updated = await this.repo.update(id, { status: 'active' as ShiftStatus }, tenantId, userId);
    if (!updated) throw new NotFoundError('Shift not found');
    return updated;
  }

  async completeShift(id: string, tenantId: string, userId: string): Promise<DriverShift> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Shift not found');
    if (existing.status !== 'active') throw new ConflictError(`Cannot complete a shift in status "${existing.status}"`);

    const updated = await this.repo.update(id, { status: 'completed' as ShiftStatus }, tenantId, userId);
    if (!updated) throw new NotFoundError('Shift not found');
    return updated;
  }

  async cancelShift(id: string, tenantId: string, userId: string): Promise<DriverShift> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Shift not found');
    if (['completed', 'cancelled'].includes(existing.status)) throw new ConflictError(`Cannot cancel a shift in status "${existing.status}"`);

    const updated = await this.repo.update(id, { status: 'cancelled' as ShiftStatus }, tenantId, userId);
    if (!updated) throw new NotFoundError('Shift not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new DriverShiftCancelledEvent(updated, { tenantId, userId }));

    return updated;
  }

  async list(filters: DriverShiftFilters, pagination: PaginationParams, tenantId: string): Promise<PaginatedResponse<DriverShift>> {
    return this.repo.getFiltered(filters, tenantId, pagination);
  }

  async get(id: string, tenantId: string): Promise<DriverShift> {
    const shift = await this.repo.findById(id, tenantId);
    if (!shift) throw new NotFoundError('Shift not found');
    return shift;
  }
}

export const schedulingService = new SchedulingService();