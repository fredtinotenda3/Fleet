// modules/reporting/repositories/report-template.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { ReportTemplate, ReportTemplateCreateDTO } from '../types/report-template.types';

export class ReportTemplateRepository extends BaseRepository<ReportTemplate> {
  protected collectionName = 'tblreporttemplates';

  private isSuperAdminTenant(tenantId: string): boolean {
    return tenantId === 'default' || tenantId === 'system' || tenantId === 'super_admin';
  }

  /**
   * System templates (tenantId 'system', isSystemTemplate: true) are
   * visible to every tenant; a tenant's own custom templates are visible
   * only to that tenant. Super-admin/system callers already see
   * everything via BaseRepository's tenant-filter bypass, so the $or
   * only matters for real tenants.
   */
  async findVisibleTo(tenantId: string): Promise<ReportTemplate[]> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const filter: Record<string, unknown> = isSuperAdmin
      ? { isDeleted: { $ne: true } }
      : { isDeleted: { $ne: true }, $or: [{ tenantId }, { isSystemTemplate: true }] };

    return collection
      .find(filter as Filter<ReportTemplate>)
      .sort({ createdAt: -1 })
      .toArray() as unknown as Promise<ReportTemplate[]>;
  }

  /**
   * Seeds a built-in template owned by the 'system' pseudo-tenant, called
   * from ReportTemplateService.seedSystemTemplates() at boot. No userId --
   * system templates aren't created by any user.
   */
  async createSystemTemplate(
    data: Omit<ReportTemplateCreateDTO, 'isSystemTemplate'> & { isSystemTemplate: true }
  ): Promise<ReportTemplate> {
    return this.create(
      {
        name: data.name,
        description: data.description,
        category: data.category,
        definition: data.definition,
        isSystemTemplate: true,
      },
      'system'
    );
  }
}

export const reportTemplateRepository = new ReportTemplateRepository();