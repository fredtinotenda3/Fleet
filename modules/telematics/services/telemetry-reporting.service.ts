// modules/telematics/services/telemetry-reporting.service.ts
//
// BACKLOG ITEM 5 (audit finding P4-N1) -- the aggregate read path that
// survives raw retention.
//
// ---------------------------------------------------------------------
// WHAT THIS IS FOR
// ---------------------------------------------------------------------
// Every telemetry AGGREGATE in the platform read `tbltelematics`
// directly, so a window older than TELEMETRY_RETENTION_DAYS returned
// nothing and reported zero distance, zero fuel, no alerts. Rollups
// existed and were retained for two years; nothing read them.
//
// This service is the one place that answers "summarise this vehicle's
// telemetry over this window", choosing the store per day
// (telemetry-window.ts) and STATING which one answered.
//
// ---------------------------------------------------------------------
// MARKED, NEVER SUBSTITUTED
// ---------------------------------------------------------------------
// The brief's constraint, and the right one: do not silently return
// aggregates where a report promised detail. So:
//
//   * `dataSource` on every result is 'raw' | 'rollup' | 'mixed' |
//     'unavailable' -- never absent, never inferred by the caller;
//   * `granularity` says whether the numbers came from individual fixes
//     or from per-day summaries;
//   * `notices` carries a sentence a UI can show verbatim, so an
//     operator reading a March figure knows it is an aggregate;
//   * fields that CANNOT be answered from a rollup are OMITTED rather
//     than zero-filled. A rollup has no per-fix positions, so there is
//     no honest `fixCount` for a rollup-answered window -- it reports
//     `rollupDays` instead. Phase 1's rule applies unchanged: a
//     fabricated 0 is indistinguishable from a real one.
//
// Detail paths are deliberately untouched. `getTelematicsHistoryInScope`
// (playback, breadcrumbs) still reads raw and still returns an empty
// list past the horizon, because an empty list is visible and an
// invented aggregate trail is not.
//
// ---------------------------------------------------------------------
// SCOPE
// ---------------------------------------------------------------------
// Both reads are the *InScope variants, so the aggregate is narrowed by
// the caller's accessible org units exactly like the rows beneath it.
// This is the specific trap this codebase has fallen into three times
// (anomaly severity counts, the report engine's `$match`, the finance
// drill-down): the list is filtered and the total is not.

import { telematicsRepository } from '../repositories/telematics.repository';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import type { TelematicsData } from '../types/telematics.types';
import { planTelemetryWindow, TelemetryWindowMode } from './telemetry-window';
import { getTelemetryRetentionConfig } from './telemetry-retention.config';

/** Where the numbers in a summary came from. */
export type TelemetryDataSource = TelemetryWindowMode;

export interface TelemetryWindowSummary {
  vehicleId: string;
  from: Date;
  to: Date;

  /** Which store(s) answered. Always present; never inferred by the caller. */
  dataSource: TelemetryDataSource;
  /** 'fix' = computed from individual readings; 'day' = from daily rollups. */
  granularity: 'fix' | 'day' | 'mixed' | 'none';

  /** Kilometres, from odometer spans. Absent when no source reported an odometer. */
  distanceKm?: number;
  maxSpeedKmh?: number;
  /**
   * Distance-unweighted mean of the per-source averages.
   *
   * Stated because it matters: for a rollup-answered window this is the
   * mean of each DAY's average speed, not the mean of every fix. A day
   * with four fixes and a day with four hundred count equally. The
   * rollup does not store enough to do better, and weighting by
   * `fixCount` would imply a precision the aggregate does not have.
   */
  avgSpeedKmh?: number;
  fuelUsedLitres?: number;
  engineHours?: number;
  alertCount: number;

  /** Raw fixes read. Absent when no raw portion was read -- never 0-filled. */
  fixCount?: number;
  /** Rollup rows read. Absent when no rollup portion was read. */
  rollupDays?: number;

  coverage: {
    rawFrom?: Date;
    rawTo?: Date;
    rollupFrom?: Date;
    rollupTo?: Date;
    /** First UTC day whose raw fixes are expected to be complete. */
    rawBoundary: Date;
  };

  /** Sentences a UI should surface verbatim. Empty only for a wholly-raw window. */
  notices: string[];
}

/**
 * Ceiling on raw fixes folded into one summary.
 *
 * A 90-day raw window for one vehicle is ~150,000 fixes at this
 * platform's poll cadence. Materialising that to compute five numbers
 * is the memory defect Phase 4 removed from the backup worker, so the
 * read is capped and the cap is REPORTED when it bites (see the notice
 * in getVehicleWindowSummaryInScope) rather than quietly changing what the totals mean.
 */
export const MAX_RAW_READINGS_PER_SUMMARY = 20_000;

interface Accumulated {
  distances: number[];
  maxSpeeds: number[];
  avgSpeeds: number[];
  fuel: number[];
  engineHours: number[];
  alerts: number;
}

function emptyAccumulator(): Accumulated {
  return { distances: [], maxSpeeds: [], avgSpeeds: [], fuel: [], engineHours: [], alerts: 0 };
}

function sum(values: number[]): number | undefined {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) : undefined;
}

function mean(values: number[]): number | undefined {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
}

function max(values: number[]): number | undefined {
  return values.length > 0 ? Math.max(...values) : undefined;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Folds raw readings into the accumulator.
 *
 * Distance uses the odometer SPAN, matching `aggregateDay` exactly --
 * so a mixed window's raw half and rollup half are computed the same
 * way and can legitimately be added. Summing inter-fix haversine
 * distances here instead would make the two halves incomparable, and
 * the join would be invisible in the total.
 */
function foldRawReadings(readings: TelematicsData[], into: Accumulated): void {
  if (readings.length === 0) return;

  const odometers: number[] = [];
  const speeds: number[] = [];
  const engineHours: number[] = [];
  let fuelUsed: number | undefined;

  for (const reading of readings) {
    // `> 0`: Phase 1 established a 0 odometer as the signature of a
    // fabricated default, and one in a min() makes the span the whole
    // vehicle lifetime.
    const odometer = finiteNumber(reading.trip?.odometer);
    if (odometer !== null && odometer > 0) odometers.push(odometer);

    const speed = finiteNumber(reading.location?.speed);
    if (speed !== null) speeds.push(speed);

    // `TelematicsData.engine` does not DECLARE engineHours, but
    // `RollupSourceReading` does and the rollup job reads it off the
    // same documents -- providers that supply it write it, and the
    // narrower published type simply does not mention it. Read exactly
    // the way the rollup reads it, so a mixed window's two halves treat
    // the field identically; reading it on one side only would make the
    // halves silently incomparable.
    const hours = finiteNumber(
      (reading.engine as { engineHours?: unknown } | undefined)?.engineHours
    );
    if (hours !== null && hours > 0) engineHours.push(hours);

    const used = finiteNumber(reading.fuel?.fuelUsed);
    if (used !== null) fuelUsed = (fuelUsed ?? 0) + used;

    into.alerts += Array.isArray(reading.alerts) ? reading.alerts.length : 0;
  }

  // Two readings minimum: one gives a span of 0, which asserts the
  // vehicle did not move when all we know is where it ended up.
  if (odometers.length >= 2) {
    into.distances.push(Math.max(...odometers) - Math.min(...odometers));
  }
  const maxSpeed = max(speeds);
  if (maxSpeed !== undefined) into.maxSpeeds.push(maxSpeed);
  const avgSpeed = mean(speeds);
  if (avgSpeed !== undefined) into.avgSpeeds.push(avgSpeed);
  if (fuelUsed !== undefined) into.fuel.push(fuelUsed);
  if (engineHours.length >= 2) {
    into.engineHours.push(Math.max(...engineHours) - Math.min(...engineHours));
  }
}

/** Folds rollup rows into the same accumulator. Absent fields stay absent. */
function foldRollups(rows: Array<Record<string, unknown>>, into: Accumulated): void {
  for (const row of rows) {
    const distance = finiteNumber(row.distanceKm);
    if (distance !== null) into.distances.push(distance);

    const maxSpeed = finiteNumber(row.maxSpeedKmh);
    if (maxSpeed !== null) into.maxSpeeds.push(maxSpeed);

    const avgSpeed = finiteNumber(row.avgSpeedKmh);
    if (avgSpeed !== null) into.avgSpeeds.push(avgSpeed);

    const fuel = finiteNumber(row.fuelUsedLitres);
    if (fuel !== null) into.fuel.push(fuel);

    const hours = finiteNumber(row.engineHours);
    if (hours !== null) into.engineHours.push(hours);

    const alerts = finiteNumber(row.alertCount);
    if (alerts !== null) into.alerts += alerts;
  }
}

export class TelemetryReportingService {
  /**
   * Summarises one vehicle's telemetry over `[from, to)`, choosing the
   * store per day and marking the result.
   *
   * Returns a summary even when nothing is stored (`dataSource:
   * 'unavailable'`, every measure absent, `alertCount: 0`), rather than
   * null. A caller rendering a report needs to distinguish "no data
   * retained" from "no vehicle", and a null collapses both.
   */
  async getVehicleWindowSummaryInScope(
    vehicleId: string,
    from: Date,
    to: Date,
    context: TenantContext,
    now: Date = new Date()
  ): Promise<TelemetryWindowSummary> {
    const plan = planTelemetryWindow(from, to, now, getTelemetryRetentionConfig());
    const acc = emptyAccumulator();

    let fixCount: number | undefined;
    let rollupDays: number | undefined;

    if (plan.rollupFrom && plan.rollupTo) {
      const rows = await telematicsRepository.getDailyRollupsInScope(
        vehicleId,
        plan.rollupFrom,
        plan.rollupTo,
        context
      );
      rollupDays = rows.length;
      foldRollups(rows, acc);
    }

    if (plan.rawFrom && plan.rawTo && plan.rawTo.getTime() > plan.rawFrom.getTime()) {
      const readings = await telematicsRepository.getTelematicsHistoryInScope(
        vehicleId,
        plan.rawFrom,
        // getTelematicsHistoryInScope filters `$lte`, so step back a
        // millisecond to keep the interval half-open and stop the
        // boundary instant landing in both halves of a mixed window.
        new Date(plan.rawTo.getTime() - 1),
        context,
        MAX_RAW_READINGS_PER_SUMMARY
      );
      fixCount = readings.length;
      foldRawReadings(readings, acc);

      if (readings.length >= MAX_RAW_READINGS_PER_SUMMARY) {
        // Said out loud rather than swallowed: a truncated read makes
        // every total below an UNDERCOUNT, and a silent undercount in a
        // cost-per-km input is the kind of wrong number nobody
        // questions.
        plan.notices.push(
          `Raw portion truncated at ${MAX_RAW_READINGS_PER_SUMMARY} fixes; totals for the ` +
            'raw days are a lower bound. Narrow the window for an exact figure.'
        );
      }
    }

    const granularity: TelemetryWindowSummary['granularity'] =
      plan.mode === 'raw'
        ? 'fix'
        : plan.mode === 'rollup'
          ? 'day'
          : plan.mode === 'mixed'
            ? 'mixed'
            : 'none';

    return {
      vehicleId,
      from,
      to,
      dataSource: plan.mode,
      granularity,
      ...(sum(acc.distances) !== undefined ? { distanceKm: sum(acc.distances) } : {}),
      ...(max(acc.maxSpeeds) !== undefined ? { maxSpeedKmh: max(acc.maxSpeeds) } : {}),
      ...(mean(acc.avgSpeeds) !== undefined ? { avgSpeedKmh: mean(acc.avgSpeeds) } : {}),
      ...(sum(acc.fuel) !== undefined ? { fuelUsedLitres: sum(acc.fuel) } : {}),
      ...(sum(acc.engineHours) !== undefined ? { engineHours: sum(acc.engineHours) } : {}),
      alertCount: acc.alerts,
      ...(fixCount !== undefined ? { fixCount } : {}),
      ...(rollupDays !== undefined ? { rollupDays } : {}),
      coverage: {
        ...(plan.rawFrom ? { rawFrom: plan.rawFrom } : {}),
        ...(plan.rawTo ? { rawTo: plan.rawTo } : {}),
        ...(plan.rollupFrom ? { rollupFrom: plan.rollupFrom } : {}),
        ...(plan.rollupTo ? { rollupTo: plan.rollupTo } : {}),
        rawBoundary: plan.rawBoundary,
      },
      notices: plan.notices,
    };
  }
}

export const telemetryReportingService = new TelemetryReportingService();
