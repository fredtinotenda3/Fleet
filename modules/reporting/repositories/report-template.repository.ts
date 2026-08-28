// modules/reporting/repositories/report-template.repository.ts
//
// FIX (Consistency/drift-prevention): same rationale as dashboard.repository.ts.

import { Filter } from 'mongodb';
import { BaseRepository, isPlatformSentinelTenant } from '@/server/repositories/base.repository';
import { PLATFORM_OWNER_TENANT_ID } from '@/server/tenancy/tenant-scope';
import { ReportTemplate, ReportTemplateCreateDTO } from '../types/report-template.types';

export class ReportTemplateRepository extends BaseRepository<ReportTemplate> {
  protected collectionName = 'tblreporttemplates';

  /**
   * System templates (tenantId PLATFORM_OWNER_TENANT_ID, isSystemTemplate:
   * true) are visible to every tenant; a tenant's own custom templates are
   * visible only to that tenant. Super-admin/system callers already see
   * everything via BaseRepository's tenant-filter bypass, so the $or
   * only matters for real tenants.
   *
   * FIX (legacy sentinel): this used to be seeded/queried with the literal
   * string 'system' as its tenantId, which is one of the values
   * server/tenancy/tenant-scope.ts's assertUsableAsTenantId() now rejects
   * outright (TenantScopeError: "Rejected legacy sentinel tenant id
   * 'system'"). createSystemTemplate() below writes rows through
   * BaseRepository.create(), which calls assertUsableAsTenantId() on every
   * write, so seeding threw at boot. PLATFORM_OWNER_TENANT_ID
   * ('__system_owned__') is the real, persistable owner value these rows
   * should carry -- see tenant-scope.ts for the PLATFORM_OWNER_TENANT_ID
   * vs PLATFORM_SCOPE_TENANT_ID distinction.
   */
  async findVisibleTo(tenantId: string): Promise<ReportTemplate[]> {
    const collection = await this.getCollection();
    const isSuperAdmin = isPlatformSentinelTenant(tenantId);

    const filter: Record<string, unknown> = isSuperAdmin
      ? { isDeleted: { $ne: true } }
      : { isDeleted: { $ne: true }, $or: [{ tenantId }, { isSystemTemplate: true }] };

    return collection
      .find(filter as Filter<ReportTemplate>)
      .sort({ createdAt: -1 })
      .toArray() as unknown as Promise<ReportTemplate[]>;
  }

  /**
   * Seeds a built-in template owned by the PLATFORM_OWNER_TENANT_ID
   * pseudo-tenant, called from ReportTemplateService.seedSystemTemplates()
   * at boot. No userId -- system templates aren't created by any user.
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
      PLATFORM_OWNER_TENANT_ID
    );
  }
}

export const reportTemplateRepository = new ReportTemplateRepository();