import { NextRequest, NextResponse } from 'next/server';
import { metricsRegistry } from '@/infrastructure/observability/metrics.registry';
import { denyMetricsRequest } from '@/server/middleware/metrics-auth';

/**
 * Prometheus scrape endpoint. Deliberately NOT wrapped in withAuth() --
 * Prometheus scrapers don't carry a NextAuth session/JWT, so this uses
 * the same fail-closed bearer-token contract as the Phase 0 cron routes
 * (see server/middleware/metrics-auth.ts, which reuses cron-auth.ts's
 * timing-safe comparison).
 *
 * PHASE 7 FOLLOW-UP: previously an unset METRICS_SCRAPE_TOKEN left the
 * endpoint OPEN -- every metric, including per-provider telematics
 * health, was servable to anyone who could reach the deployment. That
 * is the exact fail-open shape the Phase 0, F-1 fix eliminated on five
 * other routes. This endpoint now fails CLOSED: an unset token means
 * metrics are never exposed, not that the check is skipped.
 */
export async function GET(req: NextRequest) {
  const denied = denyMetricsRequest(req);
  if (denied) return denied;

  const body = await metricsRegistry.expose();
  return new NextResponse(body, {
    status: 200,
    headers: { 'Content-Type': metricsRegistry.contentType() },
  });
}
