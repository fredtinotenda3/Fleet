// modules/scheduling/services/scheduling.service.ts
import { driverShiftRepository, DriverShiftRepository } from '../repositories/scheduling.repository';
import { DriverShift, DriverShiftCreateDTO, DriverShiftFilters, ShiftStatus } from '../types/scheduling.types';
import { ConflictError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { DriverShiftCreatedEvent, DriverShiftUpdatedEvent, DriverShiftCancelledEvent } from '../events/scheduling.events';

export class SchedulingService {
  constructor(private readonly repo: DriverShiftRepository = driverShiftRepository) {}

  async createShift(data: DriverShiftCreateDTO, tenantId: string, userId: string): Promise<DriverShift> {
    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);
    if (endTime <= startTime) throw new ValidationError('endTime must be after startTime');

    const overlapping = await this.repo.findOverlappingForDriver(data.driverId, startTime, endTime, tenantId);
    if (overlapping.length > 0) throw new ConflictError('Driver already has an overlapping shift scheduled');

    const created = await this.repo.create(
      {
        tenantId,
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