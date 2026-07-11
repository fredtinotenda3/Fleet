// modules/reporting/repositories/kpi-definition.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { KPIDefinition } from '../types/kpi.types';

export class KpiDefinitionRepository extends BaseRepository<KPIDefinition> {
  protected collectionName = 'tblkpidefinitions';

  private isSuperAdminTenant(tenantId: string): boolean {
    return tenantId === 'default' || tenantId === 'system' || tenantId === 'super_admin';
  }

  async findByOrganization(tenantId: string): Promise<KPIDefinition[]> {
    return this.findMany(
      {} as Filter<KPIDefinition>,
      tenantId,
      { sortBy: 'name', sortOrder: 'asc' },
      false,
      this.isSuperAdminTenant(tenantId)
    );
  }
}

export const kpiDefinitionRepository = new KpiDefinitionRepository();