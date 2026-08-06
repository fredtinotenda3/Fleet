// modules/scheduling/repositories/scheduling.repository.ts
import { Filter } from 'mongodb';
import { TenantScopedRepository } from '@/server/repositories/tenant-scoped.repository';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { DriverShift, DriverShiftFilters } from '../types/scheduling.types';
import '../types/scheduling.tenancy-addendum';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

/**
 * SCOPED (Phase F). Rosters reveal staffing levels and individual
 * working patterns, and DEPARTMENT_MANAGER holds SCHEDULE_SHIFT_MANAGE --
 * so before this, any department manager could read AND edit any other
 * department's shifts.
 */
export class DriverShiftRepository extends TenantScopedRepository<DriverShift> {
  protected collectionName = 'tbldrivershifts';

  async getFiltered(filters: DriverShiftFilters, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<DriverShift>> {
    const filter: Record<string, unknown> = {};
    if (filters.driverId) filter.driverId = filters.driverId;
    if (filters.vehicleId) filter.vehicleId = filters.vehicleId;
    if (filters.status) filter.status = filters.status;
    if (filters.startDate || filters.endDate) {
      filter.startTime = {};
      if (filters.startDate) (filter.startTime as any).$gte = filters.startDate;
      if (filters.endDate) (filter.startTime as any).$lte = filters.endDate;
    }
    return this.findWithPagination(filter as Filter<DriverShift>, pagination, tenantId);
  }

  /** Org-unit-scoped variant of getFiltered. */
  async getFilteredInScope(
    filters: DriverShiftFilters,
    context: TenantContext,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<DriverShift>> {
    const filter: Record<string, unknown> = {};
    if (filters.driverId) filter.driverId = filters.driverId;
    if (filters.vehicleId) filter.vehicleId = filters.vehicleId;
    if (filters.status) filter.status = filters.status;
    if (filters.startDate || filters.endDate) {
      filter.startTime = {};
      if (filters.startDate) (filter.startTime as any).$gte = filters.startDate;
      if (filters.endDate) (filter.startTime as any).$lte = filters.endDate;
    }
    return this.findWithPaginationInScope(filter as Filter<DriverShift>, pagination, context);
  }

  /**
   * Overlap detection is deliberately NOT org-unit scoped.
   *
   * This is a correctness guard, not a read: it answers "is this driver
   * already rostered at this time". A driver seconded across two
   * departments would otherwise be double-booked, because the conflicting
   * shift would sit outside the booking manager's scope and be invisible
   * to the check. It stays tenant-scoped (never crosses organizations)
   * and returns only the fact of a conflict to the caller, not the
   * out-of-scope shift's contents.
   */
  async findOverlappingForDriver(driverId: string, startTime: Date, endTime: Date, tenantId: string, excludeId?: string): Promise<DriverShift[]> {
    const collection = await this.getCollection();
    const filter: Record<string, unknown> = {
      ...this.getActiveFilter(tenantId),
      driverId,
      status: { $in: ['scheduled', 'active'] },
      startTime: { $lt: endTime },
      endTime: { $gt: startTime },
    };
    if (excludeId) filter._id = { $ne: excludeId };
    return collection.find(filter as Filter<DriverShift>).toArray();
  }
}

export const driverShiftRepository = new DriverShiftRepository();