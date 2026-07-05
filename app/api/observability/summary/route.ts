import { NextRequest } from 'next/server';
import { withAuth } from '@/server/middleware/with-auth';
import { Permission } from '@/server/permissions/roles';
import { successResponse } from '@/server/utils/response.utils';
import { metricsRegistry } from '@/infrastructure/observability/metrics.registry';

async function getSummary() {
  const metricsText = await metricsRegistry.expose();
  const lines = metricsText.split('\n');

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