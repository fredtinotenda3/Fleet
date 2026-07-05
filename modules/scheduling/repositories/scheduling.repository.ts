// modules/scheduling/repositories/scheduling.repository.ts
import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { DriverShift, DriverShiftFilters } from '../types/scheduling.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

export class DriverShiftRepository extends BaseRepository<DriverShift> {
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