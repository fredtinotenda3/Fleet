// modules/dispatch/repositories/dispatch.repository.ts
import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { DispatchJob, DispatchFilters } from '../types/dispatch.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

export class DispatchRepository extends BaseRepository<DispatchJob> {
  protected collectionName = 'tbldispatchjobs';

  async getFiltered(filters: DispatchFilters, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<DispatchJob>> {
    const filter: Record<string, unknown> = {};
    if (filters.status) filter.status = filters.status;
    if (filters.priority) filter.priority = filters.priority;
    if (filters.assignedDriverId) filter.assignedDriverId = filters.assignedDriverId;
    if (filters.assignedVehicleId) filter.assignedVehicleId = filters.assignedVehicleId;
    return this.findWithPagination(filter as Filter<DispatchJob>, pagination, tenantId);
  }

  async getActiveBoard(tenantId: string): Promise<DispatchJob[]> {
    return this.findMany({ status: { $in: ['unassigned', 'assigned', 'en_route', 'in_progress'] } } as Filter<DispatchJob>, tenantId, { sortBy: 'priority', sortOrder: 'asc' });
  }
}

export const dispatchRepository = new DispatchRepository();