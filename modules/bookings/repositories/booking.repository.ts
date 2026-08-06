// modules/bookings/repositories/booking.repository.ts
import { Filter } from 'mongodb';
import { BaseRepository, isPlatformSentinelTenant } from '@/server/repositories/base.repository';
import { Booking, BookingFilters } from '../types/booking.types';
import '../types/booking.tenancy-addendum';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';

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

  private buildScopedQuery(filters: BookingFilters, context: TenantContext): Record<string, unknown> {
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };

    if (!isPlatformSentinelTenant(context.organizationId)) {
      query.tenantId = context.organizationId;
    }
    if (filters.vehicleId) query.vehicleId = filters.vehicleId;
    if (filters.requestedBy) query.requestedBy = filters.requestedBy;
    if (filters.status) query.status = filters.status;
    if (filters.startDate || filters.endDate) {
      query.startTime = {};
      if (filters.startDate) (query.startTime as any).$gte = filters.startDate;
      if (filters.endDate) (query.startTime as any).$lte = filters.endDate;
    }

    Object.assign(query, tenantScopeService.buildFilter<Booking>(context, 'orgUnitId'));
    return query;
  }

  /** Org-unit-scoped variant of getFiltered -- Fleet Manager only sees bookings for vehicles in their assigned fleet(s). */
  async getFilteredInScope(
    filters: BookingFilters,
    context: TenantContext,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Booking>> {
    const collection = await this.getCollection();
    const query = this.buildScopedQuery(filters, context);

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      collection.find(query as Filter<Booking>).sort({ startTime: -1 }).skip(skip).limit(limit).toArray(),
      collection.countDocuments(query as Filter<Booking>),
    ]);

    return {
      data: data as Booking[],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }
}

export const bookingRepository = new BookingRepository();