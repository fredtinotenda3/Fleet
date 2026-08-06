// server/scheduler/background-job-scope.service.ts
//
// PHASE D (enterprise organization-aware background processing).
//
// Every worker audited in this phase either (a) hand-rolled its own
// `db.collection('tblorganizations').find(...)` tenant enumeration
// (workers/billing.worker.ts, workers/cleanup.worker.ts,
// workers/telemetry.worker.ts, infrastructure/queue/workers/
// sla-compliance.worker.ts), or (b) skipped enumeration entirely and
// called a service with the 'system' pseudo-tenant meaning "no filter"
// (workers/maintenance.worker.ts's check-overdue), or (c) scanned a raw
// collection with an empty filter (lib/updateReminderStatuses.ts).
//
// This file is the single, reusable replacement for all of that. It
// does NOT introduce a second authorization or hierarchy system -- it
// is a thin driver on top of the services Phase A/B/C already built:
//
//   1. modules/organizations/repositories/organization.repository.ts
//      (findActiveTenantIds) -- batched enumeration of active
//      organizations, so no worker re-implements pagination/tenant
//      resolution over tblorganizations.
//   2. modules/tenancy/services/tenant-context.service.ts
//      (getHierarchyTree) -- which itself calls
//      OrgUnitRepository.findByOrganization -- the exact same
//      hierarchy read every request-scoped endpoint already uses.
//
// Every background job that needs to walk Organization -> Branch ->
// Department -> Fleet -> Workshop should go through
// backgroundJobScopeService.forEachOrganization() rather than querying
// tblorganizations or tblorgunits directly.

import { organizationRepository } from '@/modules/organizations/repositories/organization.repository';
import { tenantContextService } from '@/modules/tenancy/services/tenant-context.service';
import { OrgUnit } from '@/modules/security/types/org-unit.types';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { monitoring } from '@/infrastructure/monitoring/logger';

/** One organization's fully-resolved hierarchy, grouped by level. */
export interface OrganizationScope {
  organizationId: string;
  organizationName: string;
  branches: OrgUnit[];
  departments: OrgUnit[];
  fleets: OrgUnit[];
  workshops: OrgUnit[];
  teams: OrgUnit[];
  /** Every org unit id in this organization, flattened -- convenience for callers that just need an $in filter. */
  allOrgUnitIds: string[];
}

export interface BackgroundJobRunSummary {
  jobId: string;
  jobName: string;
  organizationsProcessed: number;
  organizationsSkipped: number;
  startedAt: Date;
  finishedAt: Date;
}

const ORGANIZATION_BATCH_SIZE = 200;

export class BackgroundJobScopeService {
  /**
   * Runs `handler` once per active organization, batching the
   * organization scan so a platform with many tenants never loads them
   * all into memory at once (Phase D requirement 10).
   *
   * Fail-closed behaviour (Phase D requirement 8): if hierarchy
   * resolution or the handler itself throws for a given organization,
   * that organization is logged, audited as skipped, and excluded from
   * this run -- it is never silently processed with an empty/unscoped
   * fallback, and one organization's failure never aborts the run for
   * every other organization.
   *
   * Every organization processed (or skipped) is audit-logged with
   * organizationId, tenantId, jobId, and actor 'system' (requirement 9).
   */
  async forEachOrganization(
    jobName: string,
    handler: (scope: OrganizationScope) => Promise<void>
  ): Promise<BackgroundJobRunSummary> {
    const jobId = `${jobName}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = new Date();
    let processed = 0;
    let skipped = 0;
    let offset = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batch = await organizationRepository.findActiveTenantIds(offset, ORGANIZATION_BATCH_SIZE);
      if (batch.length === 0) break;

      for (const org of batch) {
        try {
          const scope = await this.resolveScope(org.tenantId, org.name);
          await handler(scope);
          processed++;

          await auditLog.log({
            action: 'BACKGROUND_JOB_ORG_PROCESSED',
            userId: 'system',
            tenantId: org.tenantId,
            entityType: 'background_job',
            category: 'system',
            severity: 'info',
            metadata: { jobId, jobName, organizationId: org.tenantId },
          });
        } catch (error) {
          skipped++;
          const message = error instanceof Error ? error.message : String(error);

          monitoring.logError(
            `[BackgroundJobScope] "${jobName}" failed for organization ${org.tenantId} -- skipping (fail-closed)`,
            error as Error,
            { jobId }
          );

          await auditLog.log({
            action: 'BACKGROUND_JOB_ORG_SKIPPED',
            userId: 'system',
            tenantId: org.tenantId,
            entityType: 'background_job',
            category: 'system',
            severity: 'warning',
            metadata: { jobId, jobName, organizationId: org.tenantId, reason: message },
          });
        }
      }

      offset += batch.length;
    }

    const finishedAt = new Date();

    await auditLog.log({
      action: 'BACKGROUND_JOB_RUN_COMPLETED',
      userId: 'system',
      tenantId: 'system',
      entityType: 'background_job',
      category: 'system',
      severity: 'info',
      metadata: {
        jobId,
        jobName,
        organizationsProcessed: processed,
        organizationsSkipped: skipped,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      },
    });

    monitoring.logInfo(`[BackgroundJobScope] "${jobName}" complete`, {
      jobId,
      organizationsProcessed: processed,
      organizationsSkipped: skipped,
    });

    return {
      jobId,
      jobName,
      organizationsProcessed: processed,
      organizationsSkipped: skipped,
      startedAt,
      finishedAt,
    };
  }

  /**
   * Resolves one organization's full unit hierarchy by delegating to
   * TenantContextService.getHierarchyTree -- no separate hierarchy walk
   * is implemented here. Throws if the organization cannot be resolved
   * so callers fail closed rather than silently treating a broken
   * lookup as "this org has no branches/fleets".
   */
  private async resolveScope(organizationId: string, organizationName: string): Promise<OrganizationScope> {
    const units = await tenantContextService.getHierarchyTree(organizationId);

    const branches = units.filter((u) => u.type === 'branch');
    const departments = units.filter((u) => u.type === 'department');
    const fleets = units.filter((u) => u.type === 'fleet');
    const workshops = units.filter((u) => u.type === 'workshop');
    const teams = units.filter((u) => u.type === 'team');

    return {
      organizationId,
      organizationName,
      branches,
      departments,
      fleets,
      workshops,
      teams,
      allOrgUnitIds: units.map((u) => u._id).filter((id): id is string => Boolean(id)),
    };
  }
}

export const backgroundJobScopeService = new BackgroundJobScopeService();