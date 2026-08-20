// modules/telematics/services/eagletrack-read-through.service.ts
//
// On-demand ("read-through") Eagle Track refresh for the live map and
// vehicle detail endpoints.
//
// WHY THIS EXISTS: Vercel Hobby rejects a per-minute cron schedule (see
// vercel.json / CHANGELOG-eagletrack-readthrough-refresh.md), and
// Vercel serverless has no long-lived process to run a BullMQ worker
// either way (see workers/bootstrap.ts's own doc comment). So instead
// of a background poller, the read path itself checks Eagle Track
// staleness and triggers a sync inline, before the data is returned.
// The live map frontend already polls the Fleet API every ~10s (see
// frontend/modules/telematics/hooks/useLiveMap.ts), so that poll cadence
// is what drives freshness now, not a separate scheduler.
//
// GUARANTEES:
//   1. At most one Eagle Track sync per tenant per STALE_THRESHOLD_MS
//      window under normal operation -- gated on
//      eagletrackConfigRepository's own lastSyncAt, the same field
//      eagletrackAdapter.syncOrganization already records on every
//      code path (success or error).
//   2. When several requests for the same tenant land inside that
//      staleness window at once (multiple users viewing the map, or the
//      live-map and vehicle-detail polls firing together), a short
//      Redis lock (SET NX PX) ensures only ONE of them actually calls
//      eagletrackAdapter.syncOrganization -- the rest read whatever data
//      is already there instead of piling on redundant Eagle Track API
//      calls.
//   3. Redis is optional platform-wide (see infrastructure/queue's "boots
//      correctly in environments where REDIS_URL is absent" comment).
//      If it's unreachable, this fails OPEN -- same policy as the old
//      app/api/cron/eagletrack-sync/route.ts lock. A small in-process
//      de-dupe map still collapses concurrent requests within the SAME
//      warm serverless instance; across instances, the adapter's own
//      timestamp-based staleness guard (eagletrack.adapter.ts's
//      ingestStatus) is the backstop against duplicate points, exactly
//      as it was for the cron job.
//
// The manual POST /api/telematics/eagletrack/sync route is untouched --
// it always syncs immediately regardless of staleness, and does not go
// through this module.

import { eagletrackAdapter } from '../adapters/eagletrack/eagletrack.adapter';
import { eagletrackConfigRepository } from '../repositories/eagletrack-config.repository';
import { EagleTrackConfig } from '../adapters/eagletrack/eagletrack.types';
import { redisConnection } from '@/infrastructure/queue/queue.service';
import { monitoring } from '@/infrastructure/monitoring/logger';

/**
 * A fix/config older than this triggers a refresh. Inside the 45-60s
 * window the read-through spec calls for -- comfortably above the
 * frontend's ~10s poll interval (so most polls are a no-op read) and
 * comfortably below a minute (so staleness never runs far ahead of what
 * the old per-minute cron would have delivered).
 */
const STALE_THRESHOLD_MS = 50_000;

/**
 * Redis lock TTL: long enough to cover one Eagle Track roster+status
 * round trip, short enough that a crashed holder (function timeout,
 * cold-start kill) self-heals well within the next staleness window
 * rather than wedging refreshes for a full minute.
 */
const LOCK_TTL_MS = 25_000;

const LOCK_KEY_PREFIX = 'readthrough:eagletrack-sync:';

const UNLOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Fail-open de-dupe, keyed by tenantId. ONLY consulted when Redis is
 * unreachable -- when Redis is up, the lock above is the real guard and
 * this map is never touched. Bounded by construction: an entry only
 * ever exists for the duration of one in-flight syncOrganization call
 * and is removed in its `finally`, so this cannot grow unbounded across
 * a long-lived instance.
 */
const inFlightByTenant = new Map<string, Promise<void>>();

async function acquireLock(tenantId: string, token: string): Promise<'acquired' | 'busy' | 'unavailable'> {
  try {
    const result = await (redisConnection as any).set(
      `${LOCK_KEY_PREFIX}${tenantId}`,
      token,
      'PX',
      LOCK_TTL_MS,
      'NX'
    );
    return result === 'OK' ? 'acquired' : 'busy';
  } catch (error) {
    // Redis is optional platform-wide -- an outage here must not stop
    // the read-through refresh, only the overlap protection.
    monitoring.logWarn('[eagletrack-read-through] Lock unavailable, failing open', {
      tenantId,
      error: (error as Error).message,
    });
    return 'unavailable';
  }
}

async function releaseLock(tenantId: string, token: string): Promise<void> {
  try {
    await (redisConnection as any).eval(UNLOCK_SCRIPT, 1, `${LOCK_KEY_PREFIX}${tenantId}`, token);
  } catch (error) {
    monitoring.logWarn('[eagletrack-read-through] Failed to release lock (will expire via TTL)', {
      tenantId,
      error: (error as Error).message,
    });
  }
}

function isStale(config: EagleTrackConfig | null): boolean {
  if (!config?.enabled) return false;
  if (!config.lastSyncAt) return true;
  return Date.now() - new Date(config.lastSyncAt).getTime() > STALE_THRESHOLD_MS;
}

async function runSync(tenantId: string): Promise<void> {
  try {
    await eagletrackAdapter.syncOrganization(tenantId);
  } catch (error) {
    // syncOrganization already catches and records its own known
    // failure modes via recordSyncResult; this only guards against
    // something unexpected (e.g. a decrypt error in buildClient)
    // reaching this far. Either way, a sync failure must not break the
    // live map or vehicle detail read it's embedded in -- the caller
    // still gets whatever data already exists.
    monitoring.logWarn('[eagletrack-read-through] Sync attempt failed', {
      tenantId,
      error: (error as Error).message,
    });
  }
}

/**
 * Triggers an Eagle Track sync for `tenantId` if (and only if) Eagle
 * Track is enabled for that tenant and its last recorded sync is older
 * than STALE_THRESHOLD_MS. Never throws.
 *
 * `config` is whatever the caller already has on hand (avoids a second
 * Mongo round trip for the common case where nothing needs to happen).
 * Returns the config as it stands AFTER this call -- freshly re-read
 * only when a sync actually ran, otherwise the same object that was
 * passed in -- so callers (e.g. the live map's "Last sync" indicator)
 * don't need a round trip of their own to know what happened.
 */
export async function refreshEagleTrackIfStale(
  tenantId: string,
  config: EagleTrackConfig | null
): Promise<EagleTrackConfig | null> {
  if (!isStale(config)) return config;

  const alreadyInFlight = inFlightByTenant.get(tenantId);
  if (alreadyInFlight) {
    await alreadyInFlight;
    return eagletrackConfigRepository.getConfig(tenantId);
  }

  const lockToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const lock = await acquireLock(tenantId, lockToken);

  if (lock === 'busy') {
    // Another request is already syncing this tenant right now --
    // return what's there rather than triggering a second sync.
    return config;
  }

  if (lock === 'acquired') {
    try {
      await runSync(tenantId);
    } finally {
      await releaseLock(tenantId, lockToken);
    }
  } else {
    // Redis unavailable: fail open, relying on the adapter's own
    // staleness guard for correctness across processes. De-dupe within
    // THIS process only.
    const promise = runSync(tenantId).finally(() => inFlightByTenant.delete(tenantId));
    inFlightByTenant.set(tenantId, promise);
    await promise;
  }

  return eagletrackConfigRepository.getConfig(tenantId);
}
