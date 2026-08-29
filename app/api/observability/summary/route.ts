import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { successResponse } from '@/server/utils/response.utils';
import { metricsRegistry } from '@/infrastructure/observability/metrics.registry';

async function getSummary() {
  const metricsText = await metricsRegistry.expose();
  const lines = metricsText.split('\n');

  /**
   * Sums only the series whose label set contains `labelMatch`.
   *
   * Needed because `sumMetric` below adds every series for a metric
   * name, which for a labelled gauge like fleet_outbox_backlog would
   * total pending + processing + processed + dead_letter into one
   * meaningless figure -- and make a healthy backlog look like a crisis.
   */
  const sumLabelled = (metricName: string, labelMatch: string): number =>
    lines
      .filter((l) => l.startsWith(metricName) && l.includes(labelMatch) && !l.startsWith('#'))
      .reduce((sum, l) => sum + (parseFloat(l.split(' ').pop() || '0') || 0), 0);

  const sumMetric = (metricName: string): number =>
    lines
      .filter((l) => l.startsWith(metricName) && !l.startsWith('#'))
      .reduce((sum, l) => sum + (parseFloat(l.split(' ').pop() || '0') || 0), 0);

  return {
    timestamp: new Date().toISOString(),
    http: { totalRequests: sumMetric('fleet_http_requests_total') },
    database: {
      slowQueries: sumMetric('fleet_db_slow_queries_total'),
      errors: sumMetric('fleet_db_errors_total'),
    },
    queue: { totalProcessed: sumMetric('fleet_queue_job_total') },
    workflow: { activeInstances: sumMetric('fleet_workflow_active_instances') },
    /**
     * HARDENING (item 6) -- the built-in error surface.
     *
     * `@sentry/nextjs` was removed and sentry.ts is a documented no-op,
     * so there is no error-monitoring backend and the brief rules out
     * adding a paid one. These are the substitute, read off the registry
     * that already exists.
     *
     * `deadLetteredEvents` is the number that matters most: non-zero and
     * non-decreasing means domain events are being PERMANENTLY DROPPED
     * -- the failure Phase 3 existed to prevent, and the one nobody
     * notices without a surface.
     */
    errors: {
      unhandled: sumMetric('fleet_unhandled_errors_total'),
      providerErrors: sumMetric('fleet_telematics_provider_errors_total'),
      databaseErrors: sumMetric('fleet_db_errors_total'),
    },
    telematics: {
      syncFailures: sumLabelled('fleet_telematics_sync_total', 'status="error"'),
      staleVehicles: sumMetric('fleet_telematics_stale_vehicles'),
    },
    outbox: {
      deadLetteredEvents: sumLabelled('fleet_outbox_backlog', 'status="dead_letter"'),
      pending: sumLabelled('fleet_outbox_backlog', 'status="pending"'),
    },
    note: 'For histograms, percentiles, and per-label breakdowns, point Grafana/Prometheus at /api/observability/metrics instead of this summary.',
  };
}

// NOTE: gated on Permission.JOB_VIEW as an interim permission — see
// server/permissions/roles.observability-addendum.ts for the dedicated
// OBSERVABILITY_VIEW permission to swap in once merged.
export const GET = withAuth(
  async (_req: NextRequest) => successResponse(await getSummary()),
  { permission: Permission.JOB_VIEW }
);