// modules/telematics/services/telemetry-window.ts
//
// BACKLOG ITEM 5 (audit finding P4-N1) -- which store answers a window.
//
// ---------------------------------------------------------------------
// THE PROBLEM
// ---------------------------------------------------------------------
// Raw fixes expire after TELEMETRY_RETENTION_DAYS (90 by default).
// Daily rollups were added ALONGSIDE them and retained far longer
// (730 days), but nothing reads the rollups -- so a report asking "how
// far did this vehicle travel last March?" queries `tbltelematics`,
// finds nothing, and answers zero. A zero that means "we deleted it" is
// indistinguishable from a zero that means "it did not move".
//
// ---------------------------------------------------------------------
// THE RULE, AND WHY THE BOUNDARY DAY GOES TO THE ROLLUP
// ---------------------------------------------------------------------
// Days are the unit of decision, not instants, because a rollup row IS
// a UTC day. Splitting a window mid-day would make the day partly raw
// and partly aggregate, and any total over it would count those hours
// twice.
//
// So the boundary is `dayBucket(now - rawDays) + 1 day`:
//
//     ... older days ...  | rawBoundary |  ... newer days ...
//          ROLLUP         |             |        RAW
//
// The day CONTAINING the retention cutoff is served from the rollup,
// not from raw. That day's raw fixes are partially expired -- the
// morning is gone, the evening is not -- so reading it raw would return
// a real-looking partial day with no indication that it is partial. The
// rollup for that day was written while the data was complete. Choosing
// the complete aggregate over the partial detail is the honest option,
// and `notices` says so on every result where it applies.
//
// ---------------------------------------------------------------------
// A HONEST LIMIT: THE TTL IS ON `createdAt`, NOT `timestamp`
// ---------------------------------------------------------------------
// telemetry-retention.config.ts explains why, and it is the right
// choice -- but it means "older than the retention window" is a
// STATEMENT ABOUT LIKELY AVAILABILITY, not a guarantee of absence. A
// month of history backfilled yesterday has old `timestamp` values and
// a fresh `createdAt`, so those rows are still present.
//
// This planner does not try to be cleverer than that. It routes old
// windows to the rollup and RECORDS the caveat, rather than reading
// both stores and adding them together -- which would double-count
// exactly the backfilled days it was trying to rescue.
//
// ---------------------------------------------------------------------
// WHAT THIS DELIBERATELY DOES NOT DO
// ---------------------------------------------------------------------
// It does not turn a detail request into an aggregate one. Callers that
// promise per-fix detail (history playback, the live map's breadcrumb)
// keep reading raw and get an empty result past the horizon, which is
// visible. The brief is explicit on this, and it is right: silently
// serving aggregates where a report promised detail is worse than an
// empty result. This planner is for the AGGREGATE paths, and every
// result it produces is stamped with which store answered.

import {
  getTelemetryRetentionConfig,
  TelemetryRetentionConfig,
} from './telemetry-retention.config';
import { dayBucket } from './telemetry-rollup.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type TelemetryWindowMode =
  /** Entirely inside raw retention. Per-fix detail available. */
  | 'raw'
  /** Entirely older than raw retention. Daily aggregates only. */
  | 'rollup'
  /** Straddles the boundary: older days from rollups, newer from raw. */
  | 'mixed'
  /** Older than the rollup retention too. Nothing is stored. */
  | 'unavailable';

export interface TelemetryWindowPlan {
  mode: TelemetryWindowMode;
  /** Inclusive start of the portion answerable from raw fixes. */
  rawFrom?: Date;
  /** Exclusive end of the raw portion. */
  rawTo?: Date;
  /** Inclusive start (UTC midnight) of the portion answerable from rollups. */
  rollupFrom?: Date;
  /** Exclusive end (UTC midnight) of the rollup portion. */
  rollupTo?: Date;
  /** First UTC day whose raw fixes are expected to be complete. */
  rawBoundary: Date;
  /** First UTC day for which a rollup row is expected to still exist. */
  rollupBoundary: Date;
  /** Facts a caller must surface rather than swallow. Never empty for a non-'raw' plan. */
  notices: string[];
}

/** Adds whole days to a UTC-midnight date. */
function addDays(day: Date, days: number): Date {
  return new Date(day.getTime() + days * MS_PER_DAY);
}

/**
 * Decides which store answers each part of `[from, to)`.
 *
 * Pure and synchronous, taking `now` and the config explicitly, so
 * every boundary can be tested exhaustively without a clock or a
 * database -- the same reasoning as `aggregateDay`.
 *
 * `from`/`to` are treated as a half-open interval. A `to` at or before
 * `from` yields an empty raw plan rather than an error: an empty window
 * is a legitimate thing for a UI date picker to produce, and throwing
 * would turn a harmless no-op into a 500.
 */
export function planTelemetryWindow(
  from: Date,
  to: Date,
  now: Date = new Date(),
  config: TelemetryRetentionConfig = getTelemetryRetentionConfig()
): TelemetryWindowPlan {
  // See the header: the boundary is the first day AFTER the one the
  // cutoff falls in, so the partially-expired day goes to the rollup.
  const rawBoundary = addDays(dayBucket(new Date(now.getTime() - config.rawDays * MS_PER_DAY)), 1);
  const rollupBoundary = addDays(
    dayBucket(new Date(now.getTime() - config.rollupDays * MS_PER_DAY)),
    1
  );

  const notices: string[] = [];

  if (to.getTime() <= from.getTime()) {
    return {
      mode: 'raw',
      rawFrom: from,
      rawTo: to,
      rawBoundary,
      rollupBoundary,
      notices: [],
    };
  }

  // Retention is not declared at all: everything is raw, forever.
  if (!config.enabled) {
    return { mode: 'raw', rawFrom: from, rawTo: to, rawBoundary, rollupBoundary, notices: [] };
  }

  if (to.getTime() <= rollupBoundary.getTime()) {
    return {
      mode: 'unavailable',
      rawBoundary,
      rollupBoundary,
      notices: [
        `The requested window ends before ${rollupBoundary.toISOString().slice(0, 10)}, ` +
          `beyond both raw retention (${config.rawDays}d) and rollup retention ` +
          `(${config.rollupDays}d). No telemetry is stored for it.`,
      ],
    };
  }

  // Clamp the rollup side at the rollup horizon so a window reaching
  // further back does not silently report a complete answer for days
  // whose rollups have themselves expired.
  const effectiveFrom =
    from.getTime() < rollupBoundary.getTime() ? rollupBoundary : from;
  if (effectiveFrom.getTime() !== from.getTime()) {
    notices.push(
      `Window truncated at ${rollupBoundary.toISOString().slice(0, 10)}: rollups older than ` +
        `${config.rollupDays} days have expired.`
    );
  }

  if (effectiveFrom.getTime() >= rawBoundary.getTime()) {
    return {
      mode: 'raw',
      rawFrom: effectiveFrom,
      rawTo: to,
      rawBoundary,
      rollupBoundary,
      notices,
    };
  }

  if (to.getTime() <= rawBoundary.getTime()) {
    notices.push(
      `Answered from daily rollups: raw telemetry older than ${config.rawDays} days has been ` +
        'deleted, so this result is a per-day aggregate, not per-fix detail.'
    );
    return {
      mode: 'rollup',
      rollupFrom: dayBucket(effectiveFrom),
      rollupTo: to,
      rawBoundary,
      rollupBoundary,
      notices,
    };
  }

  notices.push(
    `Window spans the ${config.rawDays}-day raw retention horizon ` +
      `(${rawBoundary.toISOString().slice(0, 10)}). Days before it are per-day rollup ` +
      'aggregates; days on or after it are computed from raw fixes.'
  );
  return {
    mode: 'mixed',
    rollupFrom: dayBucket(effectiveFrom),
    rollupTo: rawBoundary,
    rawFrom: rawBoundary,
    rawTo: to,
    rawBoundary,
    rollupBoundary,
    notices,
  };
}

/**
 * True when a window's oldest end lies beyond raw retention.
 *
 * A convenience for detail paths that must NOT switch to aggregates but
 * should say why they are empty. `getTelematicsHistoryInScope` and the
 * live map keep returning raw rows; this just lets a caller add "and
 * that is because the data has aged out" instead of showing a blank
 * chart.
 */
export function windowPredatesRawRetention(
  from: Date,
  now: Date = new Date(),
  config: TelemetryRetentionConfig = getTelemetryRetentionConfig()
): boolean {
  if (!config.enabled) return false;
  const rawBoundary = addDays(dayBucket(new Date(now.getTime() - config.rawDays * MS_PER_DAY)), 1);
  return from.getTime() < rawBoundary.getTime();
}
