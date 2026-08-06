// workers/analytics-refresh.worker.ts
//
// FIX (Phase D -- enterprise organization-aware background processing):
// bootstrap-schedules.ts registers a recurring 'analytics-refresh'
// ScheduledJob (JobType.REFRESH_ANALYTICS, every 6h via cron-engine
// .service.ts's registerRepeatable), which enqueues onto the
// 'refresh-analytics' BullMQ queue -- but no worker in the codebase
// consumed that queue. Jobs were accumulating unprocessed; dashboard
// KPI caches were never being proactively warmed, only populated
// lazily per-request via QueryCacheService.getDashboardKPIs().
//
// This worker closes that gap. Consistent with every other fix in this
// phase: it ignores the job's outer `tenantId` (registered as the
// 'system' scheduling placeholder by cron-engine.service.ts -- see the
// comment on QueueService.scheduleOverdueCheck for why that placeholder
// exists and must never be passed to a tenant-scoped read/write) and
// instead walks every active organization via BackgroundJobScopeService,
// which reuses OrganizationRepository/TenantContextService rather than
// querying tblorganizations directly.

import { BaseWorker } from '@/infrastructure/queue/worker-base.service';
import { backgroundJobScopeService } from '@/server/scheduler/background-job-scope.service';
import { fleetAnalyticsService } from '@/modules/analytics/services/fleet-analytics.service';
import { queryCache } from '@/infrastructure/cache/query-cache.service';
import { monitoring } from '@/infrastructure/monitoring/logger';

type RefreshAnalyticsPayload = Record<string, never>;

export class AnalyticsRefreshWorker extends BaseWorker<RefreshAnalyticsPayload> {
  constructor() {
    super('refresh-analytics');
  }

  protected async process(_jobName: string): Promise<void> {
    const summary = await backgroundJobScopeService.forEachOrganization('refresh-analytics', async (scope) => {
      // Proactively re-populate the dashboard KPI cache for this
      // organization so the next request-path read is warm rather than
      // paying for a live aggregation. queryCache.getDashboardKPIs
      // already keys strictly per-tenantId (`dashboard:${tenantId}:kpis`),
      // so warming one organization can never overwrite or expose
      // another organization's cached figures.
      await queryCache.getDashboardKPIs(scope.organizationId, () =>
        fleetAnalyticsService.getFleetKPIs(scope.organizationId)
      );
    });

    monitoring.logInfo(
      `[AnalyticsRefreshWorker] Refreshed ${summary.organizationsProcessed} organization(s), skipped ${summary.organizationsSkipped}`
    );
  }
}

export const analyticsRefreshWorker = new AnalyticsRefreshWorker();