// modules/telematics/services/telemetry-retention.config.ts
//
// PHASE 4, F-12 -- how long raw telemetry is kept, and why.
//
// ---------------------------------------------------------------------
// THE PROBLEM
// ---------------------------------------------------------------------
// `tbltelematics` had no retention policy and no TTL index. At the
// ~50-second poll cadence this platform runs, one vehicle produces
// roughly 1,700 rows/day and 620k/year. At 1,000 vehicles that is
// ~620M documents a year, in a collection carrying three compound
// indexes, growing without any ceiling at all.
//
// ---------------------------------------------------------------------
// WHICH TIMESTAMP THE TTL USES: `createdAt`, NOT `timestamp`
// ---------------------------------------------------------------------
// This is the decision that matters, and the two fields mean genuinely
// different things here (see telematics.types.ts on `lastFixAt` vs
// `lastPingAt` -- the same distinction, one level down):
//
//   `timestamp` is the PROVIDER'S fix time -- when the vehicle was at
//   that position.
//   `createdAt` is when WE stored the row.
//
// A TTL on `timestamp` would be a data-loss bug. Eagle Track's history
// service deliberately backfills OLD readings
// (`bulkUpsertHistoricalReadings`, which sets `createdAt: now` on
// insert). A month-old fix ingested today has a `timestamp` already
// outside a 90-day window's tail, and with a TTL on `timestamp` Mongo's
// background monitor would delete it within a minute of it landing. The
// backfill would appear to run, report rows written, and leave nothing
// behind -- silently, and only for the oldest and most valuable part of
// the range.
//
// `createdAt` measures what retention is actually asking: how long do we
// keep what we have stored. A backfilled row gets its full window from
// the moment it arrives.
//
// THE TRADE-OFF, STATED: a bulk backfill of two-year-old history will
// sit in the collection for the whole retention window rather than
// ageing out by domain relevance. That is the right way round -- data
// arriving and immediately vanishing is a bug, data outstaying its
// domain usefulness is a cost.
//
// ---------------------------------------------------------------------
// WHY 90 DAYS
// ---------------------------------------------------------------------
// Long enough to cover the reporting windows this codebase actually
// uses: `MAX_HISTORY_SPAN_MS` in the Eagle Track history service, the
// live map's 60-minute staleness horizon, and the monthly/quarterly
// periods the finance and reporting modules aggregate over. Short enough
// that a 1,000-vehicle fleet stabilises around 155M rows rather than
// growing forever.
//
// Daily rollups (telemetry-rollup.service.ts) are retained far longer,
// so trend reporting past 90 days keeps working on aggregates after the
// raw fixes have gone.
//
// ---------------------------------------------------------------------
// A MONGO CONSTRAINT WORTH KNOWING
// ---------------------------------------------------------------------
// `expireAfterSeconds` is a property of the INDEX, not of a document, so
// retention is platform-wide. It cannot vary per tenant. A deployment
// needing per-tenant retention would need a scheduled deletion job
// instead of a TTL index; that is not built here, and the limitation is
// documented rather than worked around badly.
//
// Changing the value after the index exists needs `collMod` --
// `createIndex` with different options on the same name raises
// IndexOptionsConflict (85), which `ensureIndexes` swallows. See
// infrastructure/database/indexes.ts, which now detects and applies TTL
// changes rather than silently ignoring them.

export interface TelemetryRetentionConfig {
  /** Raw `tbltelematics` retention, in days. */
  rawDays: number;
  /** Daily rollup retention, in days. */
  rollupDays: number;
  /** Whether the TTL index should be declared at all. */
  enabled: boolean;
}

export class TelemetryRetentionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelemetryRetentionConfigError';
  }
}

/** Raw fixes. Covers every reporting window in the codebase today. */
export const DEFAULT_RAW_RETENTION_DAYS = 90;

/**
 * Rollups. Two years, because a rollup row is ~1/1700th the size of the
 * day of raw fixes it summarises: keeping several years of them costs
 * less than a week of raw telemetry, and year-on-year comparison is
 * exactly what a fleet operator asks for once the platform has been
 * running long enough to answer it.
 */
export const DEFAULT_ROLLUP_RETENTION_DAYS = 730;

/**
 * The shortest retention that will be accepted.
 *
 * Guards against a fat-fingered `TELEMETRY_RETENTION_DAYS=1` quietly
 * destroying the history every report in the platform reads. Seven days
 * is below any window this codebase queries, so a value under it is far
 * more likely to be a mistake than an intention.
 */
export const MIN_RAW_RETENTION_DAYS = 7;

function readDays(name: string, fallback: number, min: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min) {
    // Refused, not defaulted. A typo'd value silently becoming 90 means
    // an operator who set 400 for a compliance requirement would never
    // learn their setting was ignored -- and would find out when the
    // data they needed was already deleted.
    throw new TelemetryRetentionConfigError(
      `${name} must be an integer >= ${min}. Received: ${JSON.stringify(raw)}`
    );
  }
  return parsed;
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;

  const v = raw.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(v)) return true;
  if (['false', '0', 'no', 'off'].includes(v)) return false;

  throw new TelemetryRetentionConfigError(
    `${name} must be a boolean (true/false). Received: ${JSON.stringify(raw)}`
  );
}

export function resolveTelemetryRetentionConfig(): TelemetryRetentionConfig {
  const config: TelemetryRetentionConfig = {
    rawDays: readDays('TELEMETRY_RETENTION_DAYS', DEFAULT_RAW_RETENTION_DAYS, MIN_RAW_RETENTION_DAYS),
    rollupDays: readDays('TELEMETRY_ROLLUP_RETENTION_DAYS', DEFAULT_ROLLUP_RETENTION_DAYS, 1),
    // Opt-OUT rather than opt-in: the default must be the safe one, and
    // unbounded growth is not the safe one.
    enabled: readBool('TELEMETRY_RETENTION_ENABLED', true),
  };

  if (config.rollupDays < config.rawDays) {
    // Rollups exist so trend reporting survives the raw data ageing out.
    // Expiring them FIRST would delete the summary while the detail it
    // summarises is still present -- the wrong way round, and it would
    // leave a permanent hole in every long-range report.
    throw new TelemetryRetentionConfigError(
      `TELEMETRY_ROLLUP_RETENTION_DAYS (${config.rollupDays}) must be >= ` +
        `TELEMETRY_RETENTION_DAYS (${config.rawDays}): rollups exist to outlive the raw ` +
        'fixes they summarise.'
    );
  }

  return config;
}

let cached: TelemetryRetentionConfig | null = null;

export function getTelemetryRetentionConfig(): TelemetryRetentionConfig {
  if (!cached) cached = resolveTelemetryRetentionConfig();
  return cached;
}

/** TEST ONLY. */
export function resetTelemetryRetentionConfig(): void {
  cached = null;
}

export const SECONDS_PER_DAY = 24 * 60 * 60;
