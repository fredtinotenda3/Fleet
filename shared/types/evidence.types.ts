// shared/types/evidence.types.ts
//
// EVIDENCE / PROVENANCE -- the cross-module answer to "where did this
// number come from?" (Operational-Connectivity upgrade, PART 8/9).
//
// ---------------------------------------------------------------------
// WHY THIS LIVES IN shared/types AND NOT modules/fuel
// ---------------------------------------------------------------------
// `Labeled<T>` / `FindingStatus` already existed, but only inside
// modules/fuel/reporting/fuel-intelligence.types.ts, built for one
// report. The exact discipline this platform already enforces there --
// "every number carries a status; never render a derived, estimated or
// missing figure as if it were directly observed" -- is precisely PART 8
// of this upgrade, now needed by trips (distance), telematics (map
// routing) and reporting (cost/km), not just the fuel report.
//
// Moving the primitive here and having fuel-intelligence.types.ts
// re-export it keeps every existing import working (no call site in the
// fuel report changes) while giving every other module the same
// vocabulary instead of a second, slightly different one. This is the
// "enhance, don't duplicate" rule applied to a TYPE, not just a service.
//
// Nothing about the fuel report's own behaviour changes: this file is a
// pure extraction, verified by diff against the original
// fuel-intelligence.types.ts definitions.

// ---------------------------------------------------------------------
// Generic provenance label (unchanged meaning from the fuel report)
// ---------------------------------------------------------------------

export type FindingStatus = 'FACT' | 'CALCULATED' | 'ESTIMATED' | 'UNAVAILABLE' | 'DATA_QUALITY_ISSUE';

export interface Labeled<T> {
  status: FindingStatus;
  value: T | null;
  /** Required when status is UNAVAILABLE, ESTIMATED or DATA_QUALITY_ISSUE. Optional (but encouraged) for FACT/CALCULATED. */
  reason?: string;
}

export function fact<T>(value: T): Labeled<T> {
  return { status: 'FACT', value };
}
export function calculated<T>(value: T, reason?: string): Labeled<T> {
  return { status: 'CALCULATED', value, reason };
}
export function estimated<T>(value: T, reason: string): Labeled<T> {
  return { status: 'ESTIMATED', value, reason };
}
export function unavailable<T = never>(reason: string): Labeled<T> {
  return { status: 'UNAVAILABLE', value: null, reason };
}
export function dataQualityIssue<T>(value: T | null, reason: string): Labeled<T> {
  return { status: 'DATA_QUALITY_ISSUE', value, reason };
}

// ---------------------------------------------------------------------
// Distance Source Hierarchy (PART 5)
// ---------------------------------------------------------------------
//
// Kept as a SUPERSET of the strings `trip.generation-addendum.ts`
// already shipped ('odometer' | 'gps-path') rather than a parallel,
// differently-spelled enum -- a generated trip's `distance_source` and
// a map-assisted trip's `selected_distance_source` are now literally
// the same field, widened in place (see that file's own PART 5 note).
//
//   gps-path     -- OBSERVED. Integrated from a sequence of GPS fixes
//                    during a telemetry-detected trip (trip-detection.ts).
//   odometer     -- CALCULATED. end_odometer - start_odometer, whether
//                    that pair came from telemetry or was typed in.
//   map-derived  -- CALCULATED, over a ROUTING ENGINE, not telemetry.
//                    Never labelled GPS/actual/observed -- see
//                    route-distance.service.ts's header.
//   manual       -- RECORDED. A person typed a distance with no
//                    supporting odometer or route.
//   unavailable  -- no distance measurement exists at all for this trip.
export type DistanceSource = 'gps-path' | 'odometer' | 'map-derived' | 'manual' | 'unavailable';

export const DISTANCE_SOURCE_LABEL: Record<DistanceSource, string> = {
  'gps-path': 'GPS-observed',
  odometer: 'Odometer-derived',
  'map-derived': 'Map-derived',
  manual: 'Manually reported',
  unavailable: 'Unavailable',
};

/**
 * One measured/derived distance, with the provenance a reader needs to
 * decide how much to trust it. `source` says WHAT KIND of evidence this
 * is; `method` says HOW this specific number was produced (plain
 * English, shown in the "How calculated" popover); `reference` is an
 * optional pointer back to the underlying record (a route id, a
 * telemetry window) for anyone who wants to verify it.
 *
 * This is deliberately NOT a `Labeled<number>` -- a trip can hold
 * several of these side by side (one per source, see
 * TripDistanceEvidence below) and still need to say which one was
 * SELECTED, which `Labeled<T>` alone cannot express.
 */
export interface DistanceMeasurement {
  valueKm: number;
  source: DistanceSource;
  method: string;
  calculatedAt: string | Date;
  reference?: string;
}

/**
 * Every distance measurement available for a trip, keyed by source.
 * PART 5: "If multiple sources exist, preserve all available
 * measurements" -- this is the structure that preserves them. The
 * resolver (distance-source-resolver.service.ts) reads this and picks
 * one; it never deletes or overwrites a sibling entry.
 */
export interface TripDistanceEvidence {
  gps?: DistanceMeasurement;
  odometer?: DistanceMeasurement;
  mapDerived?: DistanceMeasurement;
  manual?: DistanceMeasurement;
}

// ---------------------------------------------------------------------
// Map-assisted trip log (PART 3/4)
// ---------------------------------------------------------------------

export type GeocodeProvenance = 'nominatim-search' | 'map-click' | 'map-drag' | 'manual-coordinates';

/** One stop on a map-assisted trip: start, an ordered waypoint, or the end. */
export interface TripStop {
  /** 0-based order along the route. 0 is always the start; the highest value is always the end. */
  sequence: number;
  role: 'start' | 'waypoint' | 'end';
  /** What the operator typed or what the map search result was labelled -- "Greendale", not just coordinates. */
  label: string;
  lat: number;
  lng: number;
  /** Reverse/forward-geocoded single-line address, when one was resolved. */
  address?: string;
  /** How this coordinate was obtained -- PART 3: "store the resolved geographic location and provenance". */
  geocodeProvenance: GeocodeProvenance;
  /** Set when `geocodeProvenance` is 'nominatim-search'. */
  geocodeProvider?: 'nominatim';
  geocodedAt?: string | Date;
  arrivalTime?: string | Date;
  departureTime?: string | Date;
}

/** Distance of one leg of a map-derived route, between two consecutive stops. */
export interface TripRouteLeg {
  fromSequence: number;
  toSequence: number;
  distanceKm: number;
}

/**
 * The map-derived route computed over a trip's stops.
 *
 * PART 4: this is a PLANNED / MAP-DERIVED route, never presented as what
 * the vehicle actually drove. `provider` and `calculatedAt` exist so a
 * reader -- or a later re-render after the routing engine changes -- can
 * tell when and how this number was produced; `geometry` is capped and
 * simplified (see route-distance.service.ts) purely for drawing the line
 * on a map, not treated as a measurement in its own right.
 */
export interface TripRouteEvidence {
  provider: 'osrm';
  calculatedAt: string | Date;
  legs: TripRouteLeg[];
  totalDistanceKm: number;
  /** [lng, lat] pairs, simplified for display. Optional -- a route whose geometry fetch failed can still report leg/total distances. */
  geometry?: [number, number][];
}
