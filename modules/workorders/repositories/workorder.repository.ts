// modules/workorders/repositories/workorder.repository.ts
import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { WorkOrder, WorkOrderFilters } from '../types/workorder.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

export class WorkOrderRepository extends BaseRepository<WorkOrder> {
  protected collectionName = 'tblworkorders';

  async getFiltered(filters: WorkOrderFilters, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<WorkOrder>> {
    const filter: Record<string, unknown> = {};
    if (filters.license_plate) filter.license_plate = { $regex: filters.license_plate, $options: 'i' };
    if (filters.status) filter.status = filters.status;
    if (filters.priority) filter.priority = filters.priority;
    if (filters.assignedMechanicId) filter.assignedMechanicId = filters.assignedMechanicId;
    return this.findWithPagination(filter as Filter<WorkOrder>, pagination, tenantId);
  }
}

export const workOrderRepository = new WorkOrderRepository();