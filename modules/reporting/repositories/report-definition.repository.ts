// modules/reporting/repositories/report-definition.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { ReportDefinition } from '../types/report-definition.types';

export class ReportDefinitionRepository extends BaseRepository<ReportDefinition> {
  protected collectionName = 'tblreportdefinitions';

  async findByOrganization(tenantId: string): Promise<ReportDefinition[]> {
    return this.findMany({} as Filter<ReportDefinition>, tenantId, {
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });
  }

  async findScheduled(tenantId: string): Promise<ReportDefinition[]> {
    return this.findMany(
      { 'schedule.enabled': true } as Filter<ReportDefinition>,
      tenantId
    );
  }

  /** Used by the recurring scheduler sweep, which runs across every tenant. */
  async findAllScheduled(): Promise<ReportDefinition[]> {
    const collection = await this.getCollection();
    return collection
      .find({ 'schedule.enabled': true, isDeleted: { $ne: true } } as Filter<ReportDefinition>)
      .toArray();
  }
}

export const reportDefinitionRepository = new ReportDefinitionRepository();