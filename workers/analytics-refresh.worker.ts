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
import { queryCache, orgWideCacheScope } from '@/infrastructure/cache/query-cache.service';
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
      // paying for a live aggregation.
      //
      // BACKLOG ITEM 4: the value computed here is ORG-WIDE --
      // getFleetKPIs is called with no TenantContext, deliberately,
      // because a warm job has no caller whose scope it could use. It
      // used to be stored under `dashboard:${tenantId}:kpis`, a key
      // carrying no scope at all, so the first scoped read path wired
      // to this cache would have served every branch manager the whole
      // organization's figures. `orgWideCacheScope` now states that
      // explicitly and puts it in the key, where a scoped caller's own
      // key can never collide with it.
      //
      // No-op unless QUERY_CACHE_ENABLED=true -- see the header of
      // query-cache.service.ts for why the default is off. The call is
      // left in place rather than removed so that enabling the flag
      // restores warming without another code change.
      //
      // WAVE 3, R.3.1: getFleetKPIs now requires an explicit
      // hasFinancialAccess argument (see fleet-analytics.service.ts) so a
      // caller can never silently fail open and leak totalExpenses/
      // totalFuelCost/costPerKm to a viewer without EXPENSE_VIEW/FUEL_VIEW/
      // FINANCE_VIEW. This is a background system job with no acting user
      // and no permission scope to check against -- `true` here means "the
      // warmed value carries the full, unredacted figures", which is
      // correct ONLY because this cache is not currently read by the live
      // request path (confirmed: getDashboardKPIs has no caller outside
      // this worker and its own test suite -- analytics.controller.ts
      // reads the repositories directly, uncached). If this warm cache is
      // ever wired into that live read path, whatever reads it MUST NOT
      // serve this unredacted value to a request-scoped caller without
      // re-applying that caller's own hasFinancialAccess check -- a cached
      // blob computed here must never substitute for the per-request
      // permission check in analytics.controller.ts.
      await queryCache.getDashboardKPIs(orgWideCacheScope(scope.organizationId), () =>
        fleetAnalyticsService.getFleetKPIs(scope.organizationId, undefined, undefined, true)
      );
    });

    monitoring.logInfo(
      `[AnalyticsRefreshWorker] Refreshed ${summary.organizationsProcessed} organization(s), skipped ${summary.organizationsSkipped}`
    );
  }
}

export const analyticsRefreshWorker = new AnalyticsRefreshWorker();