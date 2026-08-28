// server/middleware/metrics-auth.ts
//
// PHASE 7 FOLLOW-UP -- fail-closed auth for /api/observability/metrics.
//
// ---------------------------------------------------------------------
// THE BUG THIS REPLACES
// ---------------------------------------------------------------------
// The metrics route previously did:
//
//   const requiredToken = process.env.METRICS_SCRAPE_TOKEN;
//   if (requiredToken) {
//     const provided = req.headers.get('authorization')?.replace(...);
//     if (provided !== requiredToken) return 401;
//   }
//
// Exactly the Phase 0, F-1 shape: an UNSET token meant the whole check
// was skipped and the endpoint served every metric to anyone. This
// module applies the same fail-closed contract server/middleware/
// cron-auth.ts established for the five scheduler-invoked routes,
// scoped to METRICS_SCRAPE_TOKEN instead of CRON_SECRET.
//
// ---------------------------------------------------------------------
// THE CONTRACT
// ---------------------------------------------------------------------
//   'authorized'    -- token configured AND presented correctly.
//   'misconfigured' -- METRICS_SCRAPE_TOKEN absent/blank. HTTP 500. The
//                      endpoint DOES NOT expose metrics. 500 (not 401)
//                      because the fault is a deployment fault, not the
//                      caller's -- an operator reading logs needs to
//                      tell "the scraper has the wrong token" apart from
//                      "this deployment was never configured".
//   'unauthorized'  -- token configured, credential missing or wrong.
//                      HTTP 401.
//
// TIMING-SAFE COMPARISON: reuses `timingSafeEquals` from cron-auth.ts
// rather than re-implementing constant-time comparison a second time.
// One primitive, two callers.
//
// NO TOKEN EVER LEAVES THIS MODULE. It is never returned, never
// interpolated into a response, and never logged -- log lines record
// the outcome only.

import { NextResponse } from 'next/server';
import { monitoring } from '@/infrastructure/monitoring/logger';
import { timingSafeEquals } from './cron-auth';

export type MetricsAuthOutcome = 'authorized' | 'misconfigured' | 'unauthorized';

export interface MetricsAuthResult {
  outcome: MetricsAuthOutcome;
  /** Safe, non-revealing reason for logs and the response body. */
  reason: string;
}

const BEARER_PREFIX = 'Bearer ';

/**
 * Reads the configured scrape token.
 *
 * A whitespace-only value counts as ABSENT -- same reasoning as
 * cron-auth.ts's readConfiguredSecret: a dashboard-entered "  " would
 * otherwise satisfy a presence check while being trivially guessable.
 */
function readConfiguredToken(): string | null {
  const raw = process.env.METRICS_SCRAPE_TOKEN;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Decides whether a scrape request may proceed.
 *
 * Accepts anything with a `headers.get()` -- NextRequest and the
 * standard Request both qualify.
 */
export function authorizeMetricsRequest(req: {
  headers: { get(name: string): string | null };
}): MetricsAuthResult {
  const configured = readConfiguredToken();

  if (configured === null) {
    // FAIL CLOSED. Metrics are not exposed.
    monitoring.logError(
      '[metrics-auth] METRICS_SCRAPE_TOKEN is not configured — refusing to expose metrics',
      new Error('METRICS_SCRAPE_TOKEN_NOT_CONFIGURED'),
      { route: '/api/observability/metrics' }
    );
    return {
      outcome: 'misconfigured',
      reason:
        'This endpoint is not configured for authentication and will not expose metrics. ' +
        'Set METRICS_SCRAPE_TOKEN in the deployment environment.',
    };
  }

  const authHeader = req.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
    monitoring.logWarn('[metrics-auth] Rejected scrape request: missing bearer credential', {
      route: '/api/observability/metrics',
    });
    return { outcome: 'unauthorized', reason: 'Unauthorized' };
  }

  const presented = authHeader.slice(BEARER_PREFIX.length);

  if (!timingSafeEquals(presented, configured)) {
    monitoring.logWarn('[metrics-auth] Rejected scrape request: invalid credential', {
      route: '/api/observability/metrics',
    });
    return { outcome: 'unauthorized', reason: 'Unauthorized' };
  }

  return { outcome: 'authorized', reason: 'Authorized' };
}

/**
 * Renders a non-authorized result as a response.
 *
 * Returns null when the request IS authorized:
 *
 *   const denied = denyMetricsRequest(req);
 *   if (denied) return denied;
 *
 * The body carries the outcome code but never the configured token.
 */
export function denyMetricsRequest(req: {
  headers: { get(name: string): string | null };
}): NextResponse | null {
  const result = authorizeMetricsRequest(req);

  if (result.outcome === 'authorized') return null;

  if (result.outcome === 'misconfigured') {
    return NextResponse.json(
      { error: result.reason, code: 'METRICS_SCRAPE_TOKEN_NOT_CONFIGURED' },
      { status: 500 }
    );
  }

  return NextResponse.json({ error: result.reason, code: 'UNAUTHORIZED' }, { status: 401 });
}
