// modules/reporting/repositories/report-definition.repository.ts
//
// FIX (Consistency/drift-prevention): same rationale as dashboard.repository.ts.

import { Filter } from 'mongodb';
import { BaseRepository, isPlatformSentinelTenant } from '@/server/repositories/base.repository';
import { ReportDefinition } from '../types/report-definition.types';

export class ReportDefinitionRepository extends BaseRepository<ReportDefinition> {
  protected collectionName = 'tblreportdefinitions';

  async findByOrganization(tenantId: string): Promise<ReportDefinition[]> {
    return this.findMany(
      {} as Filter<ReportDefinition>,
      tenantId,
      { sortBy: 'createdAt', sortOrder: 'desc' },
      false,
      isPlatformSentinelTenant(tenantId)
    );
  }
}

export const reportDefinitionRepository = new ReportDefinitionRepository();