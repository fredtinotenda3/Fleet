// app/api/cron/eagletrack-sync/route.ts
//
// GET /api/cron/eagletrack-sync
//
// WHY THIS ROUTE EXISTS (read before "simplifying" it away):
// workers/telemetry.worker.ts already has an 'eagletrack-sync' branch,
// and server/scheduler/bootstrap-schedules.ts already registers a
// 'telemetry-eagletrack-sync' BullMQ repeatable job for it every 2
// minutes. On a normal deployment that would be the whole story. But
// per workers/bootstrap.ts's own doc comment, that machinery is "intended
// to run in a dedicated worker process ... since long-lived BullMQ
// Worker connections don't fit a serverless request/response lifecycle."
// This project is a Vercel serverless deployment with no such process --
// nothing ever calls bootstrapWorkers(), so no BullMQ Worker ever
// consumes the 'telemetry-jobs' queue, and the repeatable job's
// enqueues just accumulate unprocessed. That is the entire reason the
// live map has been stuck on manual POST /api/telematics/eagletrack/sync
// calls: the automatic side of the pipeline was never actually running.
//
// This route is the serverless-native replacement for that consumer.
// Vercel Cron (see vercel.json) hits it once a minute; it authenticates
// with CRON_SECRET exactly like the platform's other cron endpoints
// (/api/reminders/notify-overdue, /api/reminders/update-status,
// /api/workflows/process-timeouts, /api/security/expire-grants), then
// walks every tenant with Eagle Track enabled and calls
// eagletrackAdapter.syncOrganization(tenantId) -- the SAME adapter
// method the manual sync route (app/api/telematics/eagletrack/sync) and
// the BullMQ worker branch call. No parallel sync implementation is
// introduced; only the trigger mechanism differs. The live map frontend
// already polls the Fleet API every ~10s (see
// frontend/modules/telematics/hooks/useLiveMap.ts), so a 1-minute
// upstream refresh is the freshness ceiling, not the polling interval.
//
// The manual route keeps working unchanged (still useful right after
// saving credentials, without waiting for the next minute), and
// workers/telemetry.worker.ts / bootstrap-schedules.ts are left exactly
// as they were -- they're correct for a deployment that DOES run a
// dedicated worker process (see docker-compose.yml's `worker` service),
// and tests/unit/telematics/eagletrack-worker-wiring.spec.ts pins that
// file's structure.
//
// IDEMPOTENCY / NO DUPLICATE SYNCS:
//   1. A short-lived Redis lock (SET NX PX) wraps the whole run, so an
//      overlapping invocation (a slow run still in flight when the next
//      minute's cron fires, a retried cron delivery, or someone hitting
//      this URL by hand) skips instead of piling on a second full sweep.
//      The lock is released via a compare-and-delete Lua script so a
//      run only ever clears its OWN lock, never one a later run holds
//      after the original's TTL expired.
//   2. Per tenant, MIN_TENANT_SYNC_INTERVAL_MS additionally skips any
//      tenant whose lastSyncAt (recorded by
//      eagletrackConfigRepository.recordSyncResult, written by
//      eagletrackAdapter.syncOrganization itself) is still fresh -- this
//      is what keeps a manual sync and this cron from double-hitting the
//      same tenant's Eagle Track deployment if their timing happens to
//      coincide.
//   3. Redis is optional platform-wide (see infrastructure/queue's
//      "boots correctly in environments where REDIS_URL is absent"
//      comment). If the lock can't be acquired because Redis itself is
//      unreachable, this fails OPEN -- it logs a warning and runs the
//      sync anyway, rather than leaving the live map silently stale
//      because of an unrelated Redis outage. The adapter's own
//      timestamp-based staleness guard (eagletrack.adapter.ts's
//      ingestStatus) is the backstop against a genuine double-run
//      writing duplicate points.

import { NextRequest, NextResponse } from 'next/server';
import { eagletrackAdapter } from '@/modules/telematics/adapters/eagletrack/eagletrack.adapter';
import { eagletrackConfigRepository } from '@/modules/telematics/repositories/eagletrack-config.repository';
import { redisConnection } from '@/infrastructure/queue/queue.service';
import { monitoring } from '@/infrastructure/monitoring/logger';

const CRON_SECRET = process.env.CRON_SECRET;

const LOCK_KEY = 'cron:eagletrack-sync:lock';
/** Under the 1-minute cron interval, so a crashed run can never wedge the lock past the next scheduled tick. */
const LOCK_TTL_MS = 55_000;
/** Skip re-syncing a tenant whose Eagle Track config already recorded a sync within this window. */
const MIN_TENANT_SYNC_INTERVAL_MS = 20_000;

const UNLOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

async function acquireLock(token: string): Promise<boolean> {
  try {
    const result = await (redisConnection as any).set(LOCK_KEY, token, 'PX', LOCK_TTL_MS, 'NX');
    return result === 'OK';
  } catch (error) {
    // Redis is optional platform-wide -- an outage here must not stop
    // the sync from running, only the overlap protection.
    monitoring.logWarn('[cron/eagletrack-sync] Lock unavailable, proceeding without it', {
      error: (error as Error).message,
    });
    return true;
  }
}

async function releaseLock(token: string): Promise<void> {
  try {
    await (redisConnection as any).eval(UNLOCK_SCRIPT, 1, LOCK_KEY, token);
  } catch (error) {
    monitoring.logWarn('[cron/eagletrack-sync] Failed to release lock (will expire via TTL)', {
      error: (error as Error).message,
    });
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lockToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const acquired = await acquireLock(lockToken);
  if (!acquired) {
    return NextResponse.json({
      message: 'Eagle Track sync already in progress, skipped this tick.',
      skipped: true,
    });
  }

  try {
    const tenantIds = await eagletrackConfigRepository.listEnabledTenantIds();

    let tenantsSynced = 0;
    let tenantsSkipped = 0;
    let tenantsFailed = 0;
    let totalMatched = 0;
    const perTenant: Record<string, { matched: number; errors: string[]; skipped?: boolean }> = {};

    for (const tenantId of tenantIds) {
      try {
        // Secondary, per-tenant rate limit -- defends against this
        // tenant being synced twice in quick succession (e.g. a manual
        // sync landing right before this cron tick) independent of the
        // global run lock above.
        const config = await eagletrackConfigRepository.getConfig(tenantId);
        if (
          config?.enabled &&
          config.lastSyncAt &&
          Date.now() - new Date(config.lastSyncAt).getTime() < MIN_TENANT_SYNC_INTERVAL_MS
        ) {
          tenantsSkipped += 1;
          perTenant[tenantId] = { matched: 0, errors: [], skipped: true };
          continue;
        }

        const result = await eagletrackAdapter.syncOrganization(tenantId);
        totalMatched += result.matched;
        perTenant[tenantId] = { matched: result.matched, errors: result.errors };

        if (result.errors.length > 0) {
          tenantsFailed += 1;
          monitoring.logError(
            '[cron/eagletrack-sync] Sync completed with errors',
            new Error(result.errors.join('; ')),
            {
              tenantId,
              matched: result.matched,
              unmatched: result.unmatchedTrackers.length,
              withoutFix: result.trackersWithoutFix.length,
            }
          );
        } else {
          tenantsSynced += 1;
        }
      } catch (error) {
        tenantsFailed += 1;
        perTenant[tenantId] = { matched: 0, errors: [(error as Error).message || 'Unknown error'] };
        monitoring.logError('[cron/eagletrack-sync] Sync failed', error as Error, { tenantId });
      }
    }

    return NextResponse.json({
      message: `Eagle Track sync complete: ${tenantsSynced} synced, ${tenantsSkipped} skipped, ${tenantsFailed} failed.`,
      tenantsProcessed: tenantIds.length,
      tenantsSynced,
      tenantsSkipped,
      tenantsFailed,
      totalMatched,
      perTenant,
    });
  } catch (error) {
    monitoring.logError('[cron/eagletrack-sync] Run failed', error as Error);
    return NextResponse.json({ error: 'Failed to run Eagle Track sync' }, { status: 500 });
  } finally {
    await releaseLock(lockToken);
  }
}
