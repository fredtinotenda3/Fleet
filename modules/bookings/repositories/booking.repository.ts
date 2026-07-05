// modules/bookings/repositories/booking.repository.ts
import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { Booking, BookingFilters } from '../types/booking.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

export class BookingRepository extends BaseRepository<Booking> {
  protected collectionName = 'tblbookings';

  async getFiltered(filters: BookingFilters, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<Booking>> {
    const filter: Record<string, unknown> = {};
    if (filters.vehicleId) filter.vehicleId = filters.vehicleId;
    if (filters.requestedBy) filter.requestedBy = filters.requestedBy;
    if (filters.status) filter.status = filters.status;
    if (filters.startDate || filters.endDate) {
      filter.startTime = {};
      if (filters.startDate) (filter.startTime as any).$gte = filters.startDate;
      if (filters.endDate) (filter.startTime as any).$lte = filters.endDate;
    }
    return this.findWithPagination(filter as Filter<Booking>, pagination, tenantId);
  }

  /** Finds active (pending/approved/checked_out) bookings for a vehicle overlapping the given window. */
  async findOverlapping(vehicleId: string, startTime: Date, endTime: Date, tenantId: string, excludeId?: string): Promise<Booking[]> {
    const collection = await this.getCollection();
    const filter: Record<string, unknown> = {
      ...this.getActiveFilter(tenantId),
      vehicleId,
      status: { $in: ['pending', 'approved', 'checked_out'] },
      startTime: { $lt: endTime },
      endTime: { $gt: startTime },
    };
    if (excludeId) filter._id = { $ne: excludeId };
    return collection.find(filter as Filter<Booking>).toArray();
  }
}

export const bookingRepository = new BookingRepository();