// shared/types/trip.map-assisted-addendum.ts
//
// Fields carried by a MAP-ASSISTED trip: one entered through the Trip
// Log's location search + map (Operational-Connectivity upgrade PARTS
// 3-9), as opposed to a plain distance/odometer entry or a
// telemetry-generated one.
//
// Additive module augmentation, same pattern as
// trip.generation-addendum.ts and the *.tenancy-addendum files:
// trip.types.ts is untouched, every field is optional, and every
// existing trip row (which has none of these fields) remains valid.
//
// ---------------------------------------------------------------------
// WHY THIS IS A SEPARATE FILE FROM trip.generation-addendum.ts
// ---------------------------------------------------------------------
// That file's fields are written by EXACTLY ONE writer
// (trip-generation.service.ts, the telemetry sweep) and documents that
// writer's own concerns (idempotency keys, detector internals). These
// fields are written by TWO different, person-facing paths (the
// map-assisted create/update handlers) and describe a different thing
// entirely -- WHERE the trip went, not HOW the sweep detected it.
// Keeping them separate keeps each file's header honest about who
// writes what, the same discipline that made the generation addendum's
// own header trustworthy.

import '@/shared/types/trip.types';
import type { TripStop, TripRouteEvidence, TripDistanceEvidence } from './evidence.types';

declare module '@/shared/types/trip.types' {
  interface Trip {
    /**
     * Ordered stops for a map-assisted trip: start, zero or more
     * waypoints, end. ABSENT on a plain distance/odometer/telemetry
     * trip -- its presence is itself the signal that this trip was
     * entered via the map (PART 3), independent of `mode`.
     *
     * PART 3, item 7-8 ("reorder stops", "remove stops"): the UI may
     * freely reorder/add/remove stops before submission; `sequence` is
     * assigned fresh by the client on every edit and is simply the
     * array's own order at save time. There is no separate persisted
     * "original order" to preserve.
     */
    stops?: TripStop[];

    /**
     * The map-derived route computed over `stops`, when one was
     * obtainable. PART 4: always a PLANNED/MAP-DERIVED figure, never
     * relabelled as observed. Recomputed server-side from `stops` on
     * every create/update that changes them -- the client-submitted
     * route (if any) is advisory only, since a client could otherwise
     * submit stops with a forged, larger "route" to inflate a cost
     * report.
     */
    route?: TripRouteEvidence;

    /**
     * Every distance measurement available for this trip, by source.
     * PART 5 ("preserve all available measurements"): this is what makes
     * that possible. `distance_calculated` / `distance_source` (the
     * latter from trip.generation-addendum.ts, widened to cover these
     * same values) continue to hold the SELECTED one, resolved by
     * distance-source-resolver.service.ts -- this field is the full
     * evidence set behind that selection, inspectable via an "Evidence"
     * / "How calculated" interaction (PART 9).
     */
    distance_evidence?: TripDistanceEvidence;

    /**
     * Explicit statement of whether this vehicle had working telematics
     * at the time this trip was recorded. PART 1/20/27 ("clearly state
     * that GPS was unavailable" / "do not make the customer feel the
     * product is unusable without GPS"): recorded at write time (not
     * derived later from `distance_source`) so a vehicle that later
     * gains a tracker does not retroactively imply its past manual trips
     * secretly had GPS all along.
     *
     * Absent on trips predating this field and on telemetry-generated
     * trips, where GPS availability is self-evident from
     * `created_from: 'gps'`.
     */
    telemetry_available?: boolean;
  }
}
