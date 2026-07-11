// modules/reporting/repositories/dashboard.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { Dashboard } from '../types/dashboard.types';

export class DashboardRepository extends BaseRepository<Dashboard> {
  protected collectionName = 'tbldashboards';

  private isSuperAdminTenant(tenantId: string): boolean {
    return tenantId === 'default' || tenantId === 'system' || tenantId === 'super_admin';
  }

  async findByOrganization(tenantId: string): Promise<Dashboard[]> {
    return this.findMany(
      {} as Filter<Dashboard>,
      tenantId,
      { sortBy: 'createdAt', sortOrder: 'desc' },
      false,
      this.isSuperAdminTenant(tenantId)
    );
  }

  async findExecutive(tenantId: string): Promise<Dashboard[]> {
    return this.findMany(
      { isExecutive: true } as Filter<Dashboard>,
      tenantId,
      {},
      false,
      this.isSuperAdminTenant(tenantId)
    );
  }
}

export const dashboardRepository = new DashboardRepository();