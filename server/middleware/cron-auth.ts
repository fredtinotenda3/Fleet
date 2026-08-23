// server/middleware/cron-auth.ts
//
// PHASE 0, F-1: the single fail-CLOSED authentication primitive for
// scheduler-invoked endpoints.
//
// ---------------------------------------------------------------------
// THE BUG THIS REPLACES
// ---------------------------------------------------------------------
// Five routes each carried their own copy of:
//
//   const CRON_SECRET = process.env.CRON_SECRET;
//   if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) return 401;
//
// The `CRON_SECRET &&` guard means that when the variable is UNSET the
// comparison is skipped entirely and the request proceeds
// unauthenticated. That is backwards: a missing security configuration
// is the case where a system knows least about its caller, and is
// therefore the case where it must refuse, not the case where it must
// wave everyone through.
//
// The consequences were not theoretical. These five endpoints perform:
//
//   * /api/security/expire-grants      -- soft-deletes ResourcePermission
//     grants and then calls permissionCacheService.invalidateAll(), i.e.
//     an authorization mutation plus a global cache flush, repeatable in
//     a loop by anyone.
//   * /api/workflows/process-timeouts  -- enumerates EVERY active
//     tenantId from tblorganizations, runs escalations against each, and
//     returns the tenant list in its response body. Unauthenticated
//     cross-tenant enumeration.
//   * /api/reminders/update-status,
//     /api/reminders/notify-overdue    -- bulk status mutation across
//     every reminder in the system.
//   * /api/cron/eagletrack-sync        -- drives outbound vendor API
//     traffic, so an attacker can burn a customer's vendor rate limit.
//
// All five were GET, which means a browser preload, a link crawler, or
// an <img src> reaches them.
//
// ---------------------------------------------------------------------
// THE CONTRACT
// ---------------------------------------------------------------------
// authorizeCronRequest() returns a discriminated result rather than
// throwing, so each route renders the failure in its own response shape:
//
//   'authorized'    -- secret configured AND presented correctly.
//   'misconfigured' -- CRON_SECRET absent/blank. HTTP 500. The operation
//                      DOES NOT RUN. 500 (not 401) is deliberate: the
//                      fault is ours, not the caller's, and an operator
//                      reading logs needs to distinguish "my scheduler
//                      has the wrong token" from "this deployment was
//                      never configured".
//   'unauthorized'  -- secret configured, credential missing or wrong.
//                      HTTP 401.
//
// TIMING-SAFE COMPARISON
// The presented token is compared with crypto.timingSafeEqual. A naive
// `!==` on strings short-circuits at the first differing byte, which
// leaks the length of the shared prefix and makes the secret
// recoverable byte-by-byte by a caller who can measure response time.
// timingSafeEqual requires equal-length buffers and throws otherwise, so
// length is compared first -- that comparison is itself a leak of the
// secret's LENGTH, which is unavoidable with this scheme and materially
// less useful to an attacker than a prefix oracle.
//
// NO SECRET EVER LEAVES THIS MODULE
// The configured value is never returned, never interpolated into a
// response, and never logged -- not at debug level, not in an error
// object. Log lines record the OUTCOME and the route, never the
// credential or any prefix of it.

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { monitoring } from '@/infrastructure/monitoring/logger';

export type CronAuthOutcome = 'authorized' | 'misconfigured' | 'unauthorized';

export interface CronAuthResult {
  outcome: CronAuthOutcome;
  /** Safe, non-revealing reason for logs and the response body. */
  reason: string;
}

const BEARER_PREFIX = 'Bearer ';

/**
 * Constant-time string comparison.
 *
 * Both sides are hashed to a fixed 32-byte digest before comparison.
 * That serves two purposes: timingSafeEqual demands equal-length inputs
 * (so unequal-length secrets would otherwise have to be rejected early,
 * on a branch whose timing reveals the length), and hashing removes the
 * need to branch on length at all. The digest comparison is itself
 * constant time, so total time is independent of both the length and
 * the content of the presented value.
 */
function timingSafeEquals(presented: string, expected: string): boolean {
  const presentedDigest = crypto.createHash('sha256').update(presented, 'utf8').digest();
  const expectedDigest = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(presentedDigest, expectedDigest);
}

/**
 * Reads the configured cron secret.
 *
 * A whitespace-only value counts as ABSENT. Otherwise a deployment that
 * sets `CRON_SECRET=" "` in a dashboard would satisfy the presence check
 * while being trivially guessable, which is a worse position than an
 * honest misconfiguration because it looks configured.
 */
function readConfiguredSecret(): string | null {
  const raw = process.env.CRON_SECRET;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Decides whether a scheduler-invoked request may proceed.
 *
 * Accepts anything with a `headers.get()` -- NextRequest and the
 * standard Request both qualify, which matters because the five routes
 * are split between the two types.
 */
export function authorizeCronRequest(
  req: { headers: { get(name: string): string | null } },
  routeName: string
): CronAuthResult {
  const configured = readConfiguredSecret();

  if (configured === null) {
    // FAIL CLOSED. The operation does not run.
    monitoring.logError(
      '[cron-auth] CRON_SECRET is not configured — refusing to execute scheduled operation',
      new Error('CRON_SECRET_NOT_CONFIGURED'),
      { route: routeName }
    );
    return {
      outcome: 'misconfigured',
      reason:
        'This scheduled endpoint is not configured for authentication and will not run. ' +
        'Set CRON_SECRET in the deployment environment.',
    };
  }

  const authHeader = req.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
    monitoring.logWarn('[cron-auth] Rejected scheduled request: missing bearer credential', {
      route: routeName,
    });
    return { outcome: 'unauthorized', reason: 'Unauthorized' };
  }

  const presented = authHeader.slice(BEARER_PREFIX.length);

  if (!timingSafeEquals(presented, configured)) {
    monitoring.logWarn('[cron-auth] Rejected scheduled request: invalid credential', {
      route: routeName,
    });
    return { outcome: 'unauthorized', reason: 'Unauthorized' };
  }

  return { outcome: 'authorized', reason: 'Authorized' };
}

/**
 * Renders a non-authorized result as a response.
 *
 * Returns null when the request IS authorized, so a route reads:
 *
 *   const denied = denyCronRequest(req, '/api/...');
 *   if (denied) return denied;
 *
 * The body carries the outcome code but never the configured secret,
 * and never states whether a presented credential was close to correct.
 */
export function denyCronRequest(
  req: { headers: { get(name: string): string | null } },
  routeName: string
): NextResponse | null {
  const result = authorizeCronRequest(req, routeName);

  if (result.outcome === 'authorized') return null;

  if (result.outcome === 'misconfigured') {
    return NextResponse.json(
      { error: result.reason, code: 'CRON_SECRET_NOT_CONFIGURED' },
      { status: 500 }
    );
  }

  return NextResponse.json({ error: result.reason, code: 'UNAUTHORIZED' }, { status: 401 });
}
