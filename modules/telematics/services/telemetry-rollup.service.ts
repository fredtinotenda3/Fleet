// modules/telematics/services/telemetry-rollup.service.ts
//
// PHASE 4, F-12 -- daily aggregates, so reporting outlives the raw fixes.
//
// ---------------------------------------------------------------------
// WHY
// ---------------------------------------------------------------------
// Raw telemetry now expires after TELEMETRY_RETENTION_DAYS (90 by
// default). Anything asking "how far did this vehicle travel last
// March?" would find nothing once the window passed.
//
// A rollup row is roughly 1/1700th the size of the day of fixes it
// summarises, so years of them cost less than a week of raw telemetry.
// That asymmetry is the whole argument: keep the detail briefly, keep
// the shape indefinitely.
//
// ---------------------------------------------------------------------
// WHAT THIS DELIBERATELY DOES NOT DO
// ---------------------------------------------------------------------
// It does NOT change any existing report. Every current query still
// reads `tbltelematics` directly and keeps working unchanged inside the
// retention window -- rollups are added ALONGSIDE raw data, not in front
// of it. Migrating reports onto rollups is a separate change with its
// own verification, and doing it here would mean altering reporting
// behaviour in a phase about storage.
//
// The trade-off, stated: until reports are migrated, a query for a
// window older than the retention horizon returns empty rather than
// falling back to rollups. That is visible and fixable; the alternative
// -- silently serving aggregates where a report promised detail -- is
// neither.
//
// ---------------------------------------------------------------------
// WHY DERIVED FROM WHAT IS ALREADY STORED
// ---------------------------------------------------------------------
// Every field below is computed from readings the platform already
// holds. Nothing is estimated, interpolated or defaulted:
//
//   * `distanceKm` uses the odometer SPAN across the day
//     (max - min), not a sum of inter-fix distances. Odometer readings
//     are cumulative and authoritative; summing haversine distances
//     between sparse fixes systematically UNDER-counts (a vehicle that
//     drives a loop between two fixes reads as having gone nowhere) and
//     is corrupted by a single bad GPS point.
//   * A day with no odometer readings gets `distanceKm: undefined`, not
//     0. The Phase 1 rule applies here too: a fabricated 0 in an
//     aggregate is indistinguishable from a vehicle that genuinely did
//     not move, and cost-per-km divides by this number.
//   * `orgUnitId` is carried from the readings so a rollup is scoped
//     exactly like the telemetry it summarises.

import { BaseEntity } from '@/shared/types/common.types';

/** One vehicle, one day, one tenant. */
export interface TelemetryDailyRollup extends BaseEntity {
  tenantId: string;
  /** Inherited from the readings -- never from a request context. */
  orgUnitId?: string;
  vehicleId: string;
  /** UTC midnight of the day being summarised. */
  day: Date;

  /** Number of stored fixes. Also the confidence signal for everything else. */
  fixCount: number;

  /** Odometer span across the day, km. Absent when no fix reported one. */
  distanceKm?: number;
  odometerStart?: number;
  odometerEnd?: number;

  /** Highest road speed seen, km/h. Absent when no fix reported speed. */
  maxSpeedKmh?: number;
  /** Mean of reported speeds, km/h. */
  avgSpeedKmh?: number;

  /** Litres consumed, from fuelUsed. Absent when unreported. */
  fuelUsedLitres?: number;
  /** Engine-hours span across the day. */
  engineHours?: number;

  /** Alerts raised on readings for this vehicle and day. */
  alertCount: number;

  /** First and last fix times, for gap analysis. */
  firstFixAt?: Date;
  lastFixAt?: Date;
}

/** Minimal reading shape this module needs. Matches TelematicsData. */
export interface RollupSourceReading {
  tenantId: string;
  orgUnitId?: string;
  vehicleId: string;
  timestamp: Date | string;
  location?: { speed?: number };
  trip?: { odometer?: number };
  engine?: { engineHours?: number };
  fuel?: { fuelUsed?: number };
  alerts?: unknown[];
}

/** UTC midnight for a timestamp. Rollup days are UTC everywhere. */
export function dayBucket(timestamp: Date | string): Date {
  const d = new Date(timestamp);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Aggregates one vehicle-day.
 *
 * Pure and synchronous so it can be tested exhaustively without a
 * database. The caller supplies readings already scoped to one tenant,
 * one vehicle and one day.
 *
 * Returns `null` for an empty input rather than a zero-filled row: a day
 * with no readings did not happen as far as this collection is
 * concerned, and writing an all-zero row would make "no data" and "no
 * movement" indistinguishable in every downstream chart.
 */
export function aggregateDay(
  readings: RollupSourceReading[]
): Omit<TelemetryDailyRollup, '_id' | 'createdAt' | 'updatedAt' | 'isDeleted'> | null {
  if (readings.length === 0) return null;

  const first = readings[0];

  const odometers: number[] = [];
  const speeds: number[] = [];
  const engineHours: number[] = [];
  let fuelUsed: number | undefined;
  let alertCount = 0;
  let firstFixAt: Date | undefined;
  let lastFixAt: Date | undefined;
  let orgUnitId: string | undefined;

  for (const reading of readings) {
    const at = new Date(reading.timestamp);
    if (!firstFixAt || at < firstFixAt) firstFixAt = at;
    if (!lastFixAt || at > lastFixAt) lastFixAt = at;

    // First non-empty wins. Readings for one vehicle on one day should
    // all carry the same unit; taking the first avoids silently
    // preferring a later row if a vehicle is reassigned mid-day, which
    // would attribute the whole day to the new unit.
    if (!orgUnitId && reading.orgUnitId) orgUnitId = reading.orgUnitId;

    const odometer = reading.trip?.odometer;
    // `> 0` not `!= null`: Phase 1 established that a 0 odometer is the
    // signature of a fabricated default, and letting one into a min()
    // would make the day's distance the entire vehicle lifetime.
    if (typeof odometer === 'number' && Number.isFinite(odometer) && odometer > 0) {
      odometers.push(odometer);
    }

    const speed = reading.location?.speed;
    if (typeof speed === 'number' && Number.isFinite(speed)) speeds.push(speed);

    const hours = reading.engine?.engineHours;
    if (typeof hours === 'number' && Number.isFinite(hours) && hours > 0) {
      engineHours.push(hours);
    }

    const used = reading.fuel?.fuelUsed;
    if (typeof used === 'number' && Number.isFinite(used)) {
      fuelUsed = (fuelUsed ?? 0) + used;
    }

    alertCount += Array.isArray(reading.alerts) ? reading.alerts.length : 0;
  }

  const odometerStart = odometers.length > 0 ? Math.min(...odometers) : undefined;
  const odometerEnd = odometers.length > 0 ? Math.max(...odometers) : undefined;

  return {
    tenantId: first.tenantId,
    ...(orgUnitId ? { orgUnitId } : {}),
    vehicleId: first.vehicleId,
    day: dayBucket(first.timestamp),
    fixCount: readings.length,

    // Span, not sum -- see the header for why summing inter-fix
    // distances under-counts and is corrupted by one bad GPS point.
    // Needs at least TWO odometer readings: a single one gives a span of
    // 0, which would assert the vehicle did not move when in truth we
    // only know where it ended up.
    ...(odometers.length >= 2 && odometerEnd !== undefined && odometerStart !== undefined
      ? { distanceKm: odometerEnd - odometerStart }
      : {}),
    ...(odometerStart !== undefined ? { odometerStart } : {}),
    ...(odometerEnd !== undefined ? { odometerEnd } : {}),

    ...(speeds.length > 0
      ? {
          maxSpeedKmh: Math.max(...speeds),
          avgSpeedKmh: speeds.reduce((a, b) => a + b, 0) / speeds.length,
        }
      : {}),

    ...(fuelUsed !== undefined ? { fuelUsedLitres: fuelUsed } : {}),
    ...(engineHours.length >= 2
      ? { engineHours: Math.max(...engineHours) - Math.min(...engineHours) }
      : {}),

    alertCount,
    ...(firstFixAt ? { firstFixAt } : {}),
    ...(lastFixAt ? { lastFixAt } : {}),
  };
}

/**
 * Groups readings into (vehicle, day) buckets and aggregates each.
 *
 * Grouped in memory because the caller feeds it ONE tenant-day at a
 * time (see the retention worker), which is bounded by the fleet size
 * rather than by history. Aggregating across all history at once would
 * reintroduce the memory problem Phase 4 is removing from the backup.
 */
export function aggregateReadings(
  readings: RollupSourceReading[]
): Array<Omit<TelemetryDailyRollup, '_id' | 'createdAt' | 'updatedAt' | 'isDeleted'>> {
  const buckets = new Map<string, RollupSourceReading[]>();

  for (const reading of readings) {
    const key = `${reading.vehicleId}:${dayBucket(reading.timestamp).toISOString()}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(reading);
    else buckets.set(key, [reading]);
  }

  const rollups = [];
  for (const bucket of buckets.values()) {
    const rollup = aggregateDay(bucket);
    if (rollup) rollups.push(rollup);
  }
  return rollups;
}
