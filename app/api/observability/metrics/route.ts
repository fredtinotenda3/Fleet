import { NextRequest, NextResponse } from 'next/server';
import { metricsRegistry } from '@/infrastructure/observability/metrics.registry';

/**
 * Prometheus scrape endpoint. Deliberately NOT wrapped in withAuth() —
 * Prometheus scrapers don't carry a NextAuth session/JWT. If
 * METRICS_SCRAPE_TOKEN is configured, requests must present it via
 * Prometheus's `Authorization: Bearer <token>` bearer_token option; if
 * unset, the endpoint is open (fine behind a private network only).
 */
export async function GET(req: NextRequest) {
  const requiredToken = process.env.METRICS_SCRAPE_TOKEN;
  if (requiredToken) {
    const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (provided !== requiredToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const body = await metricsRegistry.expose();
  return new NextResponse(body, {
    status: 200,
    headers: { 'Content-Type': metricsRegistry.contentType() },
  });
}