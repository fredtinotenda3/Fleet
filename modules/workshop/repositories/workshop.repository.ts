// modules/workshop/repositories/workshop.repository.ts
import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { WorkshopBay, MechanicAssignment } from '../types/workshop.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';

export class WorkshopBayRepository extends BaseRepository<WorkshopBay> {
  protected collectionName = 'tblworkshopbays';

  async getFiltered(status: string | undefined, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<WorkshopBay>> {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    return this.findWithPagination(filter as Filter<WorkshopBay>, pagination, tenantId);
  }

  async findAvailable(tenantId: string): Promise<WorkshopBay[]> {
    return this.findMany({ status: 'available' } as Filter<WorkshopBay>, tenantId);
  }
}

export class MechanicAssignmentRepository extends BaseRepository<MechanicAssignment> {
  protected collectionName = 'tblmechanicassignments';

  async findActiveForMechanic(mechanicId: string, tenantId: string): Promise<MechanicAssignment[]> {
    return this.findMany({ mechanicId, releasedAt: { $exists: false } } as Filter<MechanicAssignment>, tenantId);
  }
}

export const workshopBayRepository = new WorkshopBayRepository();
export const mechanicAssignmentRepository = new MechanicAssignmentRepository();