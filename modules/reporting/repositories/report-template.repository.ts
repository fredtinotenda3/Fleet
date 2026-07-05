// modules/reporting/repositories/report-template.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { ReportTemplate } from '../types/report-template.types';

const SYSTEM_TENANT = 'system';

export class ReportTemplateRepository extends BaseRepository<ReportTemplate> {
  protected collectionName = 'tblreporttemplates';

  /**
   * Returns every template visible to a tenant: their own org-created
   * templates plus every system template (stored under the pseudo-tenant
   * 'system', mirroring how MaintenanceRepository's overdue sweep treats
   * 'system' as "no tenant filter" elsewhere in this codebase).
   */
  async findVisibleTo(tenantId: string): Promise<ReportTemplate[]> {
    const collection = await this.getCollection();
    return collection
      .find({
        isDeleted: { $ne: true },
        $or: [{ tenantId }, { tenantId: SYSTEM_TENANT, isSystemTemplate: true }],
      } as Filter<ReportTemplate>)
      .sort({ category: 1, name: 1 })
      .toArray();
  }

  async createSystemTemplate(
    data: Omit<ReportTemplate, '_id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt'>
  ): Promise<ReportTemplate> {
    return this.create({ ...data, tenantId: SYSTEM_TENANT }, SYSTEM_TENANT, 'system');
  }
}

export const reportTemplateRepository = new ReportTemplateRepository();