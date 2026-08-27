// modules/telematics/services/eagletrack-read-through.service.ts
//
// PHASE 4, F-16 -- a staleness CHECKER. It no longer writes.
//
// ---------------------------------------------------------------------
// WHAT THIS FILE USED TO DO, AND WHY IT HAD TO CHANGE
// ---------------------------------------------------------------------
// It ran a full Eagle Track sync INLINE on the live-map read path. A GET
// on the map could trigger a roster fetch, a fleet-status fetch, driver
// and trigger sub-syncs, device registration and N telemetry inserts --
// all before the response was returned.
//
// The reasoning was sound at the time and is recorded honestly: Vercel
// Hobby rejects a per-minute cron, and serverless has no long-lived
// process for a BullMQ worker, so the frontend's ~10s poll was made the
// de-facto scheduler. Three consequences followed:
//
//   1. p99 map latency was bounded by VENDOR latency. A slow or
//      unreachable Eagle Track deployment made the map slow for
//      everyone, and the 15s client timeout was the ceiling.
//   2. Read load amplified into vendor load. More users watching the map
//      meant more calls to a third party we do not operate.
//   3. WITH NO MAP OPEN, NOTHING WAS INGESTED. Freshness depended on
//      somebody watching. A fleet nobody was looking at had no telemetry
//      at all -- which is precisely when an alert matters most.
//
// And when Redis was unavailable it FAILED OPEN to an in-process map, so
// several serverless instances would each start their own vendor sync
// concurrently.
//
// ---------------------------------------------------------------------
// WHAT IT DOES NOW
// ---------------------------------------------------------------------
// Reads the config, decides whether the tenant's data is stale, and --
// at most -- ENQUEUES a background sync. It never calls the provider and
// never writes telemetry. The caller gets whatever is already stored,
// plus an honest `stale` flag.
//
// Enqueueing is not a write to the domain: it puts a job on a queue that
// a worker drains. The read path's own latency is a single Redis LPUSH,
// not a vendor round trip, and it is fire-and-forget -- a queue failure
// degrades freshness, never the read.
//
// ---------------------------------------------------------------------
// REDIS UNAVAILABLE: FAIL SAFE, NOT FAIL OPEN
// ---------------------------------------------------------------------
// The old fallback ran the sync anyway with only in-process de-duping.
// Now, if the queue cannot be reached, the refresh is simply SKIPPED and
// the data is reported stale. That is the honest outcome: we could not
// arrange a refresh, so we say the data is old rather than starting
// uncoordinated vendor calls from every instance at once.
//
// No database-backed lock was added. It would be a second locking
// mechanism to reason about, and it is unnecessary now that the read
// path performs no vendor work: the ONLY thing needing coordination is
// job enqueueing, and BullMQ's `jobId` de-duplication already provides
// it (see `enqueueSync` below).
//
// ---------------------------------------------------------------------
// THE REAL INGESTION PATH IS NOW THE SCHEDULER
// ---------------------------------------------------------------------
// `bootstrap-schedules.ts` runs `telemetry-<provider>-sync` on a repeating
// schedule, independent of anyone having the map open. This module is a
// top-up for the case where a user is actively watching and the last
// scheduled sync is older than the staleness window -- not the primary
// mechanism. See docs/INGESTION_AND_RETENTION.md for the topology.

import { eagletrackConfigRepository } from '../repositories/eagletrack-config.repository';
import { EagleTrackConfig } from '../adapters/eagletrack/eagletrack.types';
import { monitoring } from '@/infrastructure/monitoring/logger';
import { PROVIDER_EAGLETRACK } from '../providers/provider.types';

/**
 * A config older than this is considered stale.
 *
 * Unchanged from the pre-Phase-4 value: comfortably above the frontend's
 * ~10s poll (so most polls are a pure read) and below a minute (so
 * staleness never runs far ahead of what a per-minute cron delivered).
 */
export const STALE_THRESHOLD_MS = 50_000;

/**
 * De-dupe window for enqueued refresh jobs.
 *
 * Matches the staleness threshold so at most one refresh job exists per
 * tenant per window, however many users are watching the map. BullMQ
 * rejects a duplicate `jobId` outright, so this is enforced by the queue
 * rather than by a lock we maintain.
 */
export const ENQUEUE_DEDUPE_WINDOW_MS = STALE_THRESHOLD_MS;

export interface StalenessResult {
  /** Config as stored. NEVER re-read after a sync -- no sync happens here. */
  config: EagleTrackConfig | null;
  /** True when the last recorded sync is older than the threshold. */
  stale: boolean;
  /** Whether a background refresh was successfully enqueued. */
  refreshRequested: boolean;
}

export function isStale(config: EagleTrackConfig | null, now: number = Date.now()): boolean {
  if (!config?.enabled) return false;
  if (!config.lastSyncAt) return true;
  return now - new Date(config.lastSyncAt).getTime() > STALE_THRESHOLD_MS;
}

/**
 * Asks the queue for a refresh. Never throws, never blocks on a vendor.
 *
 * The `jobId` is bucketed to the de-dupe window, so every request inside
 * the same window computes the SAME id and BullMQ keeps only the first.
 * That replaces the Redis SET NX lock the old implementation held across
 * a vendor round trip -- there is no vendor round trip here to hold a
 * lock across.
 */
async function enqueueSync(tenantId: string): Promise<boolean> {
  try {
    const { queueService, JobType } = await import('@/infrastructure/queue/queue.service');

    const bucket = Math.floor(Date.now() / ENQUEUE_DEDUPE_WINDOW_MS);

    await queueService.addJob(
      JobType.EAGLETRACK_SYNC,
      {
        type: JobType.EAGLETRACK_SYNC,
        tenantId,
        payload: { requestedBy: 'read-through' },
      },
      { jobId: `readthrough:${PROVIDER_EAGLETRACK}:${tenantId}:${bucket}` }
    );
    return true;
  } catch (error) {
    // FAIL SAFE. Previously this branch ran the sync anyway with only
    // in-process de-duping, so N serverless instances made N concurrent
    // vendor calls. Now the refresh is skipped and the caller is told
    // the data is stale.
    monitoring.logWarn('[eagletrack-read-through] Could not enqueue refresh; reporting stale', {
      tenantId,
      error: (error as Error).message,
    });
    return false;
  }
}

/**
 * Reports whether a tenant's Eagle Track data is stale, and requests a
 * background refresh if so.
 *
 * PERFORMS NO PROVIDER CALL AND NO TELEMETRY WRITE. `config` is returned
 * exactly as supplied -- the old version re-read it after syncing, which
 * is meaningless now that nothing is synced inline.
 */
export async function checkEagleTrackStaleness(
  tenantId: string,
  config: EagleTrackConfig | null
): Promise<StalenessResult> {
  if (!isStale(config)) {
    return { config, stale: false, refreshRequested: false };
  }

  const refreshRequested = await enqueueSync(tenantId);
  return { config, stale: true, refreshRequested };
}

/**
 * BACKWARD-COMPATIBLE SHIM.
 *
 * Kept so existing callers and their tests keep compiling, but it no
 * longer refreshes anything: it checks staleness, may enqueue, and
 * returns the config unchanged.
 *
 * Deliberately NOT deleted outright -- a silent signature change on a
 * function whose name promises a refresh would leave call sites reading
 * as though they still refresh. The name is retained with its behaviour
 * documented here, and callers have been migrated to
 * `checkEagleTrackStaleness`, which says what it does.
 *
 * @deprecated Use checkEagleTrackStaleness.
 */
export async function refreshEagleTrackIfStale(
  tenantId: string,
  config: EagleTrackConfig | null
): Promise<EagleTrackConfig | null> {
  const result = await checkEagleTrackStaleness(tenantId, config);
  return result.config;
}
