// modules/bookings/services/booking.service.ts
import { bookingRepository, BookingRepository } from '../repositories/booking.repository';
import { Booking, BookingCreateDTO, BookingFilters, BookingStatus } from '../types/booking.types';
import { ConflictError, NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import {
  BookingCreatedEvent,
  BookingApprovedEvent,
  BookingRejectedEvent,
  BookingCancelledEvent,
  BookingCheckedOutEvent,
  BookingCheckedInEvent,
} from '../events/booking.events';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { WriteScope, tenantIdOf } from '@/server/tenancy/write-scope';
import { vehicleWriteResolver } from '@/modules/vehicles/services/vehicle-write-resolver.service';

export class BookingService {
  constructor(private readonly repo: BookingRepository = bookingRepository) {}

  /**
   * THREE FIXES.
   *
   * 1. SCOPE MISMATCH. BookingRepository.getFilteredInScope filters on
   *    orgUnitId and create never wrote it -- a booking made by a
   *    scope-narrowed user was invisible to that user. Same class as
   *    drivers; see server/tenancy/write-scope.ts.
   * 2. NO VEHICLE VALIDATION AT ALL. The vehicle was never looked up,
   *    so a booking could be made against a plate in another tenant, a
   *    deleted vehicle, or nothing at all.
   * 3. `vehicleId` AND `license_plate` WERE BOTH TAKEN FROM THE CLIENT
   *    and never checked against each other, so they could disagree --
   *    findOverlapping keys off vehicleId while every human-facing
   *    surface renders license_plate, meaning the double-booking guard
   *    could be protecting a different vehicle from the one displayed.
   *    Both are now derived from ONE resolved vehicle.
   */
  async create(data: BookingCreateDTO, scope: WriteScope, userId: string): Promise<Booking> {
    const tenantId = tenantIdOf(scope);
    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);
    if (endTime <= startTime) throw new ValidationError('endTime must be after startTime');

    const vehicle = await vehicleWriteResolver.resolveForWrite(data.license_plate, scope);
    const vehicleId = String(vehicle._id);

    const overlapping = await this.repo.findOverlapping(vehicleId, startTime, endTime, tenantId);
    if (overlapping.length > 0) throw new ConflictError('Vehicle is already booked for an overlapping time window');

    const created = await this.repo.create(
      {
        tenantId,
        ...(vehicleWriteResolver.orgUnitIdFor(vehicle)
          ? { orgUnitId: vehicleWriteResolver.orgUnitIdFor(vehicle) }
          : {}),
        vehicleId,
        license_plate: vehicle.license_plate.toUpperCase(),
        requestedBy: userId,
        purpose: data.purpose,
        startTime,
        endTime,
        status: 'pending',
      } as any,
      tenantId,
      userId
    );

    const bus = EventBusFactory.getInstance();
    await bus.publish(new BookingCreatedEvent(created, { tenantId, userId }));
    await auditLog.logCreate(userId, tenantId, 'booking', created._id!, { vehicleId: created.vehicleId });

    return created;
  }

  async approve(id: string, tenantId: string, userId: string): Promise<Booking> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Booking not found');
    if (existing.status !== 'pending') throw new ConflictError(`Cannot approve a booking in status "${existing.status}"`);

    const overlapping = await this.repo.findOverlapping(existing.vehicleId, existing.startTime, existing.endTime, tenantId, id);
    const conflictWithApproved = overlapping.some((b) => b.status === 'approved' || b.status === 'checked_out');
    if (conflictWithApproved) throw new ConflictError('Another approved booking overlaps this time window');

    const updated = await this.repo.update(id, { status: 'approved' as BookingStatus, approvedBy: userId }, tenantId, userId);
    if (!updated) throw new NotFoundError('Booking not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new BookingApprovedEvent(updated, { tenantId, userId }));

    return updated;
  }

  async reject(id: string, reason: string, tenantId: string, userId: string): Promise<Booking> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Booking not found');
    if (existing.status !== 'pending') throw new ConflictError(`Cannot reject a booking in status "${existing.status}"`);

    const updated = await this.repo.update(id, { status: 'rejected' as BookingStatus, rejectionReason: reason }, tenantId, userId);
    if (!updated) throw new NotFoundError('Booking not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new BookingRejectedEvent(updated, { tenantId, userId }));

    return updated;
  }

  async cancel(id: string, tenantId: string, userId: string): Promise<Booking> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Booking not found');
    if (['checked_in', 'cancelled', 'rejected'].includes(existing.status)) {
      throw new ConflictError(`Cannot cancel a booking in status "${existing.status}"`);
    }

    const updated = await this.repo.update(id, { status: 'cancelled' as BookingStatus }, tenantId, userId);
    if (!updated) throw new NotFoundError('Booking not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new BookingCancelledEvent(updated, { tenantId, userId }));

    return updated;
  }

  async checkOut(id: string, odometer: number, tenantId: string, userId: string): Promise<Booking> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Booking not found');
    if (existing.status !== 'approved') throw new ConflictError('Booking must be approved before check-out');

    const updated = await this.repo.update(id, { status: 'checked_out' as BookingStatus, checkOutOdometer: odometer, checkOutAt: new Date() }, tenantId, userId);
    if (!updated) throw new NotFoundError('Booking not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new BookingCheckedOutEvent(updated, { tenantId, userId }));

    return updated;
  }

  async checkIn(id: string, odometer: number, tenantId: string, userId: string): Promise<Booking> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Booking not found');
    if (existing.status !== 'checked_out') throw new ConflictError('Booking must be checked out before check-in');
    if (existing.checkOutOdometer != null && odometer < existing.checkOutOdometer) {
      throw new ValidationError('Check-in odometer cannot be less than check-out odometer');
    }

    const updated = await this.repo.update(id, { status: 'checked_in' as BookingStatus, checkInOdometer: odometer, checkInAt: new Date() }, tenantId, userId);
    if (!updated) throw new NotFoundError('Booking not found');

    const bus = EventBusFactory.getInstance();
    await bus.publish(new BookingCheckedInEvent(updated, { tenantId, userId }));

    return updated;
  }

  async list(filters: BookingFilters, pagination: PaginationParams, tenantId: string): Promise<PaginatedResponse<Booking>> {
    return this.repo.getFiltered(filters, tenantId, pagination);
  }

  async get(id: string, tenantId: string): Promise<Booking> {
    const booking = await this.repo.findById(id, tenantId);
    if (!booking) throw new NotFoundError('Booking not found');
    return booking;
  }
}

export const bookingService = new BookingService();