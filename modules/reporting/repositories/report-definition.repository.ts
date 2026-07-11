// modules/reporting/repositories/report-definition.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { ReportDefinition } from '../types/report-definition.types';

export class ReportDefinitionRepository extends BaseRepository<ReportDefinition> {
  protected collectionName = 'tblreportdefinitions';

  private isSuperAdminTenant(tenantId: string): boolean {
    return tenantId === 'default' || tenantId === 'system' || tenantId === 'super_admin';
  }

  async findByOrganization(tenantId: string): Promise<ReportDefinition[]> {
    return this.findMany(
      {} as Filter<ReportDefinition>,
      tenantId,
      { sortBy: 'createdAt', sortOrder: 'desc' },
      false,
      this.isSuperAdminTenant(tenantId)
    );
  }
}

export const reportDefinitionRepository = new ReportDefinitionRepository();