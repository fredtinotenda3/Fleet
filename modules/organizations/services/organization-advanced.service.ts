// modules/organizations/services/organization-advanced.service.ts
//
// Kept as a separate service (rather than growing organization.service.ts
// further) for the same reason the settings-addendum fields were added:
// isolates Advanced Administration's read/write surface from the
// core organization lifecycle service.

import { organizationRepository, OrganizationRepository } from '../repositories/organization.repository';
import { Organization } from '@/shared/types/organization.types';
import {
  OrganizationAISettings,
  OrganizationReportingPreferences,
} from '@/shared/types/organization.advanced-addendum';
import { NotFoundError } from '@/server/errors/app.errors';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { permissionCacheService } from '@/modules/security/services/permission-cache.service';

export class OrganizationAdvancedService {
  constructor(private readonly repo: OrganizationRepository = organizationRepository) {}

  async updateFeatureFlags(
    organizationId: string,
    features: Partial<Organization['features']>,
    tenantId: string,
    userId: string
  ): Promise<Organization> {
    const existing = await this.repo.findById(organizationId, tenantId, false, true);
    if (!existing) throw new NotFoundError('Organization not found');

    const merged = { ...existing.features, ...features };
    const updated = await this.repo.update(
      organizationId,
      { features: merged } as Partial<Organization>,
      tenantId,
      userId,
      true
    );
    if (!updated) throw new NotFoundError('Organization not found');

    await auditLog.logUpdate(userId, tenantId, 'organization', organizationId, existing, updated);

    // Feature flags gate things like advancedAnalytics/apiAccess that
    // permission decisions and dashboards read; drop the cached
    // permission decisions for this tenant so the change is visible
    // immediately rather than waiting out the cache TTL.
    await permissionCacheService.invalidateTenant(tenantId).catch(() => undefined);

    return updated;
  }

  async updateAISettings(
    organizationId: string,
    data: OrganizationAISettings,
    tenantId: string,
    userId: string
  ): Promise<Organization> {
    const existing = await this.repo.findById(organizationId, tenantId, false, true);
    if (!existing) throw new NotFoundError('Organization not found');

    const updated = await this.repo.update(
      organizationId,
      { aiSettings: data } as Partial<Organization>,
      tenantId,
      userId,
      true
    );
    if (!updated) throw new NotFoundError('Organization not found');

    await auditLog.log({
      action: 'ORGANIZATION_AI_SETTINGS_UPDATED',
      userId,
      tenantId,
      entityType: 'organization',
      entityId: organizationId,
      metadata: { aiSettings: data },
    });

    return updated;
  }

  async updateReportingPreferences(
    organizationId: string,
    data: OrganizationReportingPreferences,
    tenantId: string,
    userId: string
  ): Promise<Organization> {
    const existing = await this.repo.findById(organizationId, tenantId, false, true);
    if (!existing) throw new NotFoundError('Organization not found');

    const updated = await this.repo.update(
      organizationId,
      { reportingPreferences: data } as Partial<Organization>,
      tenantId,
      userId,
      true
    );
    if (!updated) throw new NotFoundError('Organization not found');

    await auditLog.log({
      action: 'ORGANIZATION_REPORTING_PREFERENCES_UPDATED',
      userId,
      tenantId,
      entityType: 'organization',
      entityId: organizationId,
      metadata: { reportingPreferences: data },
    });

    return updated;
  }

  /**
   * Lightweight activity summary for the Organization Analytics page.
   * Uses AuditLogRepository.findWithFilters (the only read path the real
   * append-only repository exposes) and reads `.pagination.total` as the
   * count, since the repository deliberately has no standalone count().
   * Filter fields match AuditLogFilters exactly: tenantId, entityType,
   * entityId, startDate/endDate (not createdAt).
   */
  async getActivitySummary(
    organizationId: string,
    tenantId: string
  ): Promise<{ last30DaysAuditEvents: number; last7DaysAuditEvents: number }> {
    const existing = await this.repo.findById(organizationId, tenantId, false, true);
    if (!existing) throw new NotFoundError('Organization not found');

    let last30 = 0;
    let last7 = 0;
    try {
      const { auditLogRepository } = await import('@/modules/security/repositories/audit-log.repository');
      const now = new Date();
      const from30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const from7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [result30, result7] = await Promise.all([
        auditLogRepository.findWithFilters(
          {
            tenantId,
            entityType: 'organization',
            entityId: organizationId,
            startDate: from30,
          } as any,
          { page: 1, limit: 1 }
        ),
        auditLogRepository.findWithFilters(
          {
            tenantId,
            entityType: 'organization',
            entityId: organizationId,
            startDate: from7,
          } as any,
          { page: 1, limit: 1 }
        ),
      ]);

      last30 = result30.pagination.total;
      last7 = result7.pagination.total;
    } catch {
      // AuditLogFilters shape may evolve; degrade to 0 rather than fail the page
    }

    return { last30DaysAuditEvents: last30, last7DaysAuditEvents: last7 };
  }
}

export const organizationAdvancedService = new OrganizationAdvancedService();