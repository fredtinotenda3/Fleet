// modules/reporting/repositories/dashboard.repository.ts
//
// FIX (Consistency/drift-prevention): replaced the locally-duplicated
// isSuperAdminTenant() with base.repository.ts's exported
// isPlatformSentinelTenant(), the single source of truth introduced
// specifically to prevent the kind of tenant-scope drift documented in
// that file's own comments (a real prior bug where dashboard stats and
// list pages disagreed on what "see everything" meant because the
// sentinel set was defined independently in multiple repositories).

import { Filter } from 'mongodb';
import { BaseRepository, isPlatformSentinelTenant } from '@/server/repositories/base.repository';
import { Dashboard } from '../types/dashboard.types';

export class DashboardRepository extends BaseRepository<Dashboard> {
  protected collectionName = 'tbldashboards';

  async findByOrganization(tenantId: string): Promise<Dashboard[]> {
    return this.findMany(
      {} as Filter<Dashboard>,
      tenantId,
      { sortBy: 'createdAt', sortOrder: 'desc' },
      false,
      isPlatformSentinelTenant(tenantId)
    );
  }

  async findExecutive(tenantId: string): Promise<Dashboard[]> {
    return this.findMany(
      { isExecutive: true } as Filter<Dashboard>,
      tenantId,
      {},
      false,
      isPlatformSentinelTenant(tenantId)
    );
  }
}

export const dashboardRepository = new DashboardRepository();