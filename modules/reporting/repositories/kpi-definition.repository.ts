// modules/reporting/repositories/kpi-definition.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { KPIDefinition } from '../types/kpi.types';

export class KpiDefinitionRepository extends BaseRepository<KPIDefinition> {
  protected collectionName = 'tblkpidefinitions';

  async findByOrganization(tenantId: string): Promise<KPIDefinition[]> {
    return this.findMany({} as Filter<KPIDefinition>, tenantId, {
      sortBy: 'name',
      sortOrder: 'asc',
    });
  }
}

export const kpiDefinitionRepository = new KpiDefinitionRepository();