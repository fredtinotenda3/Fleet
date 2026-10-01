// modules/trips/services/distance-source-resolver.service.ts
//
// PART 5 -- "which distance do we believe?", in one place, for trips.
// Same spirit as modules/telematics/services/odometer-reconciliation.ts
// (which decides which ODOMETER READING to believe): this decides which
// DISTANCE MEASUREMENT a trip's `distance_calculated` should carry, when
// more than one source produced one.
//
// ---------------------------------------------------------------------
// THE RULE (fixed priority, not a vote or an average)
// ---------------------------------------------------------------------
//   1. GPS / telematics-observed distance   (gps-path)
//   2. Odometer-derived distance            (odometer)
//   3. Map-derived route distance            (map-derived)
//   4. Manually reported distance            (manual)
//   5. Unavailable                           (unavailable)
//
// This is a FIXED ORDER, not "pick whichever is largest" or "average
// them" -- averaging a GPS-observed 51.8 km with a map-derived 45.4 km
// would produce a number that is neither the vehicle's actual path nor
// its planned one, and would silently misrepresent both. PART 6 ("Actual
// vs Planned") depends on the two staying distinguishable, which a
// blended number destroys.
//
// ---------------------------------------------------------------------
// WHAT THIS DOES NOT DO
// ---------------------------------------------------------------------
// It never deletes or mutates a sibling measurement -- every source
// offered in `TripDistanceEvidence` is preserved on the trip record
// exactly as the odometer-reconciliation module's own header insists
// ("not a write path... discarding raw provider data would destroy the
// evidence"). This module only decides which ONE of the preserved values
// becomes the trip's headline `distance_calculated` / `trip_distance`.
//
// A measurement is trusted as offered: this resolver does not
// second-guess a GPS or odometer figure the way odometer-reconciliation
// does for a live telemetry stream (that guard runs upstream, at
// ingestion, where the "candidate vs. incumbent" comparison makes sense;
// a trip's GPS distance here is already the output of a completed,
// detected journey, not a raw reading to be plausibility-checked again).

import type { DistanceMeasurement, DistanceSource, TripDistanceEvidence } from '@/shared/types/evidence.types';

export interface ResolvedTripDistance {
  /** The distance to store in distance_calculated / trip_distance. Null when no source is available. */
  valueKm: number | null;
  source: DistanceSource;
  /** The full measurement that was selected, or undefined when unavailable. */
  selected?: DistanceMeasurement;
}

const PRIORITY: ReadonlyArray<keyof TripDistanceEvidence> = ['gps', 'odometer', 'mapDerived', 'manual'];

const SOURCE_FOR_KEY: Record<keyof TripDistanceEvidence, DistanceSource> = {
  gps: 'gps-path',
  odometer: 'odometer',
  mapDerived: 'map-derived',
  manual: 'manual',
};

/**
 * A measurement is usable only if it is a finite, non-negative number.
 * A corrupt or negative value in an otherwise-higher-priority source
 * does NOT fall through silently averaged with a lower source -- it is
 * treated as absent for that source, and resolution continues down the
 * priority list. Guarding here (rather than trusting every caller to
 * have already validated) is what makes this resolver safe to call with
 * evidence assembled from several independent write paths (telemetry
 * sweep, manual form, map-assisted form, bulk import).
 */
function isUsable(measurement: DistanceMeasurement | undefined): measurement is DistanceMeasurement {
  return (
    !!measurement &&
    Number.isFinite(measurement.valueKm) &&
    measurement.valueKm >= 0
  );
}

/**
 * Resolves the single "selected distance" for a trip from all available
 * evidence, per the PART 5 priority order.
 *
 * Pure and synchronous by design -- this is a decision over data already
 * gathered, not an I/O step, so it is trivially unit-testable and safe to
 * call from both the create/update handlers and from a read-side
 * backfill script without touching the database itself.
 */
export function resolveSelectedDistance(evidence: TripDistanceEvidence | undefined): ResolvedTripDistance {
  if (!evidence) {
    return { valueKm: null, source: 'unavailable' };
  }

  for (const key of PRIORITY) {
    const candidate = evidence[key];
    if (isUsable(candidate)) {
      return { valueKm: candidate.valueKm, source: SOURCE_FOR_KEY[key], selected: candidate };
    }
  }

  return { valueKm: null, source: 'unavailable' };
}

/**
 * Convenience constructor for a DistanceMeasurement, so every call site
 * stamps `calculatedAt` consistently rather than each inventing its own
 * `new Date()` placement (the same class of bug Wave 2's allocation-
 * posting fix found: a missing/inconsistent timestamp on a measurement
 * is uncorrectable once it has fed a downstream total).
 */
export function buildDistanceMeasurement(
  valueKm: number,
  source: DistanceSource,
  method: string,
  reference?: string
): DistanceMeasurement {
  return {
    valueKm,
    source,
    method,
    calculatedAt: new Date(),
    ...(reference ? { reference } : {}),
  };
}

export const distanceSourceResolver = { resolveSelectedDistance, buildDistanceMeasurement };
