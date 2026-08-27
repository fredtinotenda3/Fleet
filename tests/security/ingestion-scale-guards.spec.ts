// tests/security/ingestion-scale-guards.spec.ts
//
// PHASE 4, F-16 and F-21 -- the read path, and where ingestion comes from.
//
// Structural where the property is "this code path does not do X". A
// behavioural test can show that a given call did not sync; only a
// source assertion shows that no call CAN.

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

function codeOf(rel: string): string {
  return fs
    .readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

import {
  isStale,
  checkEagleTrackStaleness,
  STALE_THRESHOLD_MS,
} from '@/modules/telematics/services/eagletrack-read-through.service';
import { EagleTrackConfig } from '@/modules/telematics/adapters/eagletrack/eagletrack.types';

jest.mock('@/infrastructure/monitoring/logger', () => ({
  monitoring: { logError: jest.fn(), logWarn: jest.fn(), logInfo: jest.fn(), logDebug: jest.fn() },
}));

const mockAddJob = jest.fn();
jest.mock('@/infrastructure/queue/queue.service', () => ({
  queueService: { addJob: (...args: unknown[]) => mockAddJob(...args) },
  JobType: { EAGLETRACK_SYNC: 'eagletrack-sync' },
}));

function config(over: Partial<EagleTrackConfig> = {}): EagleTrackConfig {
  return { enabled: true, lastSyncAt: new Date(), ...over } as EagleTrackConfig;
}

beforeEach(() => {
  mockAddJob.mockReset();
  mockAddJob.mockResolvedValue({ id: 'job-1' });
});

describe('F-16: staleness detection', () => {
  it('is not stale immediately after a sync', () => {
    expect(isStale(config({ lastSyncAt: new Date() }))).toBe(false);
  });

  it('is stale past the threshold', () => {
    const old = new Date(Date.now() - STALE_THRESHOLD_MS - 1000);
    expect(isStale(config({ lastSyncAt: old }))).toBe(true);
  });

  it('is stale when never synced', () => {
    expect(isStale(config({ lastSyncAt: undefined }))).toBe(true);
  });

  it('is never stale when the integration is disabled', () => {
    // Nothing to refresh, so reporting stale would be a permanent false
    // alarm on every tenant that does not use Eagle Track.
    expect(isStale(config({ enabled: false, lastSyncAt: undefined }))).toBe(false);
    expect(isStale(null)).toBe(false);
  });
});

describe('F-16: the read path enqueues, it does not sync', () => {
  it('does nothing at all when data is fresh', async () => {
    const result = await checkEagleTrackStaleness('tenant-a', config());

    expect(result.stale).toBe(false);
    expect(result.refreshRequested).toBe(false);
    expect(mockAddJob).not.toHaveBeenCalled();
  });

  it('enqueues a background refresh when stale', async () => {
    const stale = config({ lastSyncAt: new Date(Date.now() - STALE_THRESHOLD_MS - 1000) });
    const result = await checkEagleTrackStaleness('tenant-a', stale);

    expect(result.stale).toBe(true);
    expect(result.refreshRequested).toBe(true);
    expect(mockAddJob).toHaveBeenCalledTimes(1);
  });

  it('returns the config UNCHANGED -- it is not re-read', async () => {
    // The old version re-read config after syncing. Meaningless now that
    // nothing is synced inline, and a wasted round trip on every stale
    // read.
    const stale = config({ lastSyncAt: new Date(Date.now() - STALE_THRESHOLD_MS - 1000) });
    const result = await checkEagleTrackStaleness('tenant-a', stale);

    expect(result.config).toBe(stale);
  });

  it('de-duplicates concurrent requests via a bucketed job id', async () => {
    // Replaces the Redis SET NX lock the old code held ACROSS a vendor
    // round trip. There is no vendor round trip here to hold one across.
    const stale = config({ lastSyncAt: new Date(0) });

    await checkEagleTrackStaleness('tenant-a', stale);
    await checkEagleTrackStaleness('tenant-a', stale);

    const ids = mockAddJob.mock.calls.map((c) => c[2].jobId);
    expect(ids[0]).toBe(ids[1]);
  });

  it('uses a DIFFERENT job id per tenant', async () => {
    const stale = config({ lastSyncAt: new Date(0) });

    await checkEagleTrackStaleness('tenant-a', stale);
    await checkEagleTrackStaleness('tenant-b', stale);

    const ids = mockAddJob.mock.calls.map((c) => c[2].jobId);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('FAILS SAFE when the queue is unreachable', async () => {
    // The old fallback ran the sync anyway with only in-process
    // de-duping, so N serverless instances made N concurrent vendor
    // calls. Now the refresh is skipped and the caller is told the data
    // is stale.
    mockAddJob.mockRejectedValue(new Error('redis down'));
    const stale = config({ lastSyncAt: new Date(0) });

    const result = await checkEagleTrackStaleness('tenant-a', stale);

    expect(result.stale).toBe(true);
    expect(result.refreshRequested).toBe(false);
  });

  it('never throws, whatever the queue does', async () => {
    mockAddJob.mockRejectedValue(new Error('redis down'));
    await expect(
      checkEagleTrackStaleness('tenant-a', config({ lastSyncAt: new Date(0) }))
    ).resolves.toBeDefined();
  });
});

describe('F-21: ingestion does not depend on somebody watching the map', () => {
  it('the scheduler runs provider syncs independently of HTTP cron', () => {
    // The real ingestion path. Previously the read-through was the de
    // facto scheduler, so a fleet nobody was watching ingested nothing.
    const src = codeOf('server/scheduler/bootstrap-schedules.ts');
    expect(src).toContain('telemetry-cartrack-sync');
    expect(src).toContain('telemetry-eagletrack-sync');
  });

  it('the Vercel cron is no longer daily', () => {
    // It was '0 0 * * *' -- once a day -- while the read-through service
    // said per-minute was needed.
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    const cron = vercel.crons.find((c: { path: string }) =>
      c.path.includes('eagletrack-sync')
    );

    expect(cron).toBeDefined();
    expect(cron.schedule).not.toBe('0 0 * * *');
    // Sub-hourly: the minute field must carry a step or a list.
    expect(cron.schedule.split(' ')[0]).toMatch(/[*/,-]/);
  });

  it('a daily rollup is scheduled inside the retention window', () => {
    // Must run well before the TTL removes the raw fixes, so a failed
    // run has the whole window to be retried.
    const src = codeOf('server/scheduler/bootstrap-schedules.ts');
    expect(src).toContain('telemetry-daily-rollup');
    expect(src).toContain('TELEMETRY_ROLLUP');
  });

  it('workers do not silently no-op in production without Redis', () => {
    // It was a logWarn in every environment. In production that means
    // telemetry sync, outbox processing, backups, rollups and retention
    // are all not running while the app looks healthy.
    const src = codeOf('workers/bootstrap.ts');
    expect(src).toContain("NODE_ENV === 'production'");
    expect(src).toContain('logError');
    expect(src).toContain('WORKERS_DISABLED_NO_REDIS');
  });
});

describe('F-12: the retention index cannot quietly disappear', () => {
  it('a TTL index is declared on tbltelematics', () => {
    const {
      TELEMATICS_INDEXES,
    } = require('@/infrastructure/database/indexes.telematics-addendum');

    const ttl = TELEMATICS_INDEXES.tbltelematics.find(
      (i: { name: string }) => i.name === 'ttl_telematics_created_at'
    );

    expect(ttl).toBeDefined();
    expect(ttl.expireAfterSeconds).toBeGreaterThan(0);
  });

  it('the TTL is keyed on createdAt, NOT timestamp', () => {
    // THE decision that matters. Eagle Track backfills OLD readings
    // whose provider `timestamp` is already outside the window's tail --
    // a TTL on `timestamp` would delete them within a minute of them
    // landing, silently, for exactly the oldest part of the range.
    const {
      TELEMATICS_INDEXES,
    } = require('@/infrastructure/database/indexes.telematics-addendum');

    const ttl = TELEMATICS_INDEXES.tbltelematics.find(
      (i: { name: string }) => i.name === 'ttl_telematics_created_at'
    );

    expect(Object.keys(ttl.key)).toEqual(['createdAt']);
    expect(Object.keys(ttl.key)).not.toContain('timestamp');
  });

  it('a changed TTL is applied via collMod rather than swallowed', () => {
    // createIndex with different options raises IndexOptionsConflict
    // (85), which ensureIndexes swallows. For a TTL that is exactly what
    // happens when an operator changes TELEMETRY_RETENTION_DAYS and
    // re-runs db:indexes -- the new retention would silently never apply
    // while the command reported success.
    const src = codeOf('infrastructure/database/indexes.ts');
    expect(src).toContain('collMod');
    expect(src).toContain('expireAfterSeconds');
  });

  it('the rollup collection is indexed and uniquely keyed', () => {
    const {
      TELEMATICS_INDEXES,
    } = require('@/infrastructure/database/indexes.telematics-addendum');

    const rollup = TELEMATICS_INDEXES.tbltelematics_daily_rollup;
    expect(rollup).toBeDefined();

    const unique = rollup.find((i: { unique?: boolean }) => i.unique);
    expect(Object.keys(unique.key)).toEqual(['tenantId', 'vehicleId', 'day']);
  });
});
