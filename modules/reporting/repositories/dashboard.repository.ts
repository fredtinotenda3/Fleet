// modules/reporting/repositories/dashboard.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { Dashboard } from '../types/dashboard.types';

export class DashboardRepository extends BaseRepository<Dashboard> {
  protected collectionName = 'tbldashboards';

  async findByOrganization(tenantId: string): Promise<Dashboard[]> {
    return this.findMany({} as Filter<Dashboard>, tenantId, {
      sortBy: 'name',
      sortOrder: 'asc',
    });
  }

  async findExecutive(tenantId: string): Promise<Dashboard[]> {
    return this.findMany({ isExecutive: true } as Filter<Dashboard>, tenantId);
  }
}

export const dashboardRepository = new DashboardRepository();