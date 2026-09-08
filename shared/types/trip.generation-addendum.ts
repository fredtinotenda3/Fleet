// shared/types/trip.generation-addendum.ts
//
// Fields carried by a trip that was GENERATED from telemetry rather than
// entered by a person or loaded from a spreadsheet.
//
// Additive module augmentation, the same pattern as the *.tenancy-addendum
// files: trip.types.ts is untouched, every field is optional, and every
// existing trip row remains valid. `Trip.created_from` already declared
// `'gps'` as a provenance value before any generator existed -- this
// addendum is what that value finally means.
//
// ---------------------------------------------------------------------
// WHY `distance_km_known` EXISTS
// ---------------------------------------------------------------------
// `Trip.distance_calculated` is a REQUIRED number on a shipped schema
// that every distance aggregate in the product sums. A generated trip
// whose distance could not be established -- no odometer readings and no
// GPS fixes -- has no honest value to put there.
//
// This codebase's rule is "never write 0 for unknown", and it exists
// because a fabricated 0 was reported to this customer as "Current fuel
// efficiency (0.0 km/L) is below optimal" with a $5,000 opportunity
// attached. But `distance_calculated` cannot be made optional without a
// migration across every consumer.
//
// So the 0 is written, and `distance_km_known: false` records that it is
// an absence. Consumers that must not average a fabricated zero -- fleet
// efficiency, cost-per-km, the allocation ledger -- filter on the flag.
// `trip_distance` is left UNSET in that case, so a consumer reading the
// optional field gets `undefined` rather than a lie.
//
// This is the one place the rule is bent, it is bent because of a
// pre-existing non-optional field, and this comment is the reason it is
// not a silent bend.

import '@/shared/types/trip.types';

declare module '@/shared/types/trip.types' {
  interface Trip {
    // ── Provenance and idempotency ──────────────────────────────────
    /**
     * Deterministic identity for a generated trip:
     * `<tenantId>:<vehicleId>:<startAt ISO>`.
     *
     * Backed by a PARTIAL unique index on `{tenantId, generation_key}`
     * that applies only to documents which have the field -- manual and
     * imported trips have none and are unaffected, and may legitimately
     * share a start time.
     *
     * This index, not the detector's watermark, is the real guarantee
     * that a re-run cannot duplicate a journey.
     */
    generation_key?: string;
    /** The vehicle's Mongo `_id`, so route playback can query telemetry without a plate lookup. */
    generation_vehicle_id?: string;
    /** Why detection closed this trip. Answers "why is this trip four minutes long". */
    generation_end_reason?: 'ignition-off' | 'stopped' | 'signal-gap';
    /** How many telemetry readings the trip was derived from. */
    generation_reading_count?: number;

    // ── Measurement honesty ─────────────────────────────────────────
    /**
     * False when `distance_calculated` is a placeholder 0 rather than a
     * measurement. See this file's header. Absent on manual and imported
     * trips, where the distance was supplied by a person.
     */
    distance_km_known?: boolean;
    /** Which instrument produced the distance. `null` when unmeasurable. */
    distance_source?: 'odometer' | 'gps-path' | null;

    // ── Telemetry-derived detail ────────────────────────────────────
    /** km/h, highest observed during the trip. Absent when unreported. */
    max_speed?: number;
    start_lat?: number;
    start_lng?: number;
    end_lat?: number;
    end_lng?: number;
  }
}
