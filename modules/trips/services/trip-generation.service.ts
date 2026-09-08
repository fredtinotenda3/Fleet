// modules/trips/services/trip-generation.service.ts
//
// The I/O shell around the pure detector in trip-detection.ts.
//
// Reads persisted telemetry, feeds it to `detectTrips`, and writes the
// resulting journeys as Trip records. Everything interesting about WHEN
// a trip starts and ends lives in the detector; everything about tenancy,
// org units and idempotent writes lives here.
//
// ---------------------------------------------------------------------
// IDEMPOTENCY, IN THREE LAYERS
// ---------------------------------------------------------------------
// Trip generation runs on a schedule, may overlap itself, and must be
// re-runnable after a bug fix. Three independent mechanisms, because any
// one of them alone has a hole:
//
//   1. THE WATERMARK (`lastProcessedAt` per vehicle). Readings already
//      processed are skipped by the detector. Cheap, but lost if the
//      state document is deleted or a sweep crashes after writing trips
//      and before saving state.
//   2. THE GENERATION KEY (`generation_key`, deterministic from tenant +
//      vehicle + start instant) with a PARTIAL UNIQUE INDEX. This is the
//      real guarantee: even a full re-run from a wiped watermark cannot
//      create a second row for the same journey, because the database
//      refuses it.
//   3. `$setOnInsert` on the upsert, so a re-run never MUTATES an
//      existing trip. A trip that has already been posted to the
//      allocation ledger must not silently change its distance
//      underneath the posting.
//
// The partial index matters: it applies only to documents that HAVE a
// generation_key, so the thousands of manually entered and imported
// trips -- which have none -- are unaffected and can still share a start
// time.
//
// ---------------------------------------------------------------------
// SCOPE
// ---------------------------------------------------------------------
// A generated trip inherits `orgUnitId` from the VEHICLE, exactly like
// every other vehicle-derived record in this codebase (fuel, expenses,
// maintenance, work orders). Resolved through the same memoised
// `resolveAlertOwnership` the digital-twin projection uses, so the
// vehicle row is the single source of truth and a reassigned vehicle
// takes its future trips with it.
//
// The sweep has no acting user, so there is no org-unit scope to check
// against -- it is a system write in the sense of
// server/tenancy/write-scope.ts. It never crosses a TENANT boundary:
// every read and write is filtered by the tenantId it was invoked with.

import connectToDatabase from '@/infrastructure/database/mongodb';
import { monitoring } from '@/infrastructure/monitoring/logger';
import { Trip } from '@/shared/types/trip.types';
import '@/shared/types/trip.generation-addendum';
import { vehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { resolveAlertOwnership } from '@/modules/telematics/services/alert-ownership.resolver';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { TripCreatedEvent } from '@/modules/trips/events/TripCreatedEvent';
import {
  detectTrips,
  tripGenerationKey,
  DetectedTrip,
  DetectionReading,
  TripDetectionConfig,
  DEFAULT_TRIP_DETECTION_CONFIG,
} from './trip-detection';
import { tripDetectionStateRepository } from '../repositories/trip-detection-state.repository';

/**
 * How far back the FIRST sweep for a vehicle looks.
 *
 * Bounded deliberately. Without it, enabling trip generation on a tenant
 * with a year of retained telemetry would read the entire history in one
 * job and generate a year of trips in a single transaction-less burst.
 * An operator who wants that runs the backfill explicitly with a stated
 * window.
 */
export const FIRST_RUN_LOOKBACK_HOURS = 24;

/**
 * Overlap re-read before the watermark.
 *
 * Readings can arrive out of order -- a provider replaying a buffered
 * queue after a coverage gap is the common case. Re-reading a margin
 * means a late reading is still seen. The detector's watermark makes the
 * overlap harmless.
 */
export const WATERMARK_OVERLAP_MINUTES = 10;

/** Cap per vehicle per run, so one chatty device cannot starve the sweep. */
export const MAX_READINGS_PER_VEHICLE_PER_RUN = 5_000;

export interface TripGenerationResult {
  vehiclesConsidered: number;
  vehiclesWithReadings: number;
  tripsCreated: number;
  tripsAlreadyPresent: number;
  errors: string[];
}

interface RawReading {
  timestamp: Date;
  location?: { lat?: number; lng?: number; speed?: number };
  trip?: { odometer?: number };
  engine?: { ignition?: boolean };
  providerMetadata?: Record<string, unknown>;
}

/**
 * Extracts the ignition signal.
 *
 * `TelematicsData` has no first-class ignition field -- the canonical
 * provider type does (`CanonicalEngine.ignition`) but the persisted
 * reading drops it. Rather than widen the persisted schema and require a
 * migration, this reads the two places an adapter can honestly have put
 * it, and returns `undefined` when neither is present.
 *
 * `undefined` is load-bearing: the detector treats it as "this device
 * does not report ignition" and falls back to movement. Returning
 * `false` for an unreported signal would end every trip on its first
 * reading. See the detector's SIGNAL PRIORITY note.
 */
export function extractIgnition(reading: RawReading): boolean | undefined {
  const direct = (reading.engine as { ignition?: unknown } | undefined)?.ignition;
  if (typeof direct === 'boolean') return direct;

  const fromMetadata = reading.providerMetadata?.ignition;
  if (typeof fromMetadata === 'boolean') return fromMetadata;
  // Some adapters carry the vendor's raw integer (io["1"] on Eagle Track).
  if (fromMetadata === 1 || fromMetadata === 0) return fromMetadata === 1;

  return undefined;
}

/** Persisted reading -> the reduced shape the detector consumes. */
export function toDetectionReading(reading: RawReading): DetectionReading {
  return {
    timestamp: reading.timestamp,
    speed: reading.location?.speed,
    lat: reading.location?.lat,
    lng: reading.location?.lng,
    odometer: reading.trip?.odometer,
    ignition: extractIgnition(reading),
  };
}

export class TripGenerationService {
  /**
   * Generates trips for every vehicle in a tenant that has new telemetry.
   *
   * Per-vehicle try/catch is load-bearing rather than defensive
   * decoration: one vehicle with a corrupt reading must not stop the
   * sweep for the rest of the fleet, and the same reasoning the telemetry
   * worker applies per tenant applies here per vehicle.
   */
  async generateForTenant(
    tenantId: string,
    options: { now?: Date; config?: TripDetectionConfig } = {}
  ): Promise<TripGenerationResult> {
    const now = options.now ?? new Date();
    const config = options.config ?? DEFAULT_TRIP_DETECTION_CONFIG;

    const result: TripGenerationResult = {
      vehiclesConsidered: 0,
      vehiclesWithReadings: 0,
      tripsCreated: 0,
      tripsAlreadyPresent: 0,
      errors: [],
    };

    const vehicles = await vehicleRepository.findMany({}, tenantId);
    result.vehiclesConsidered = vehicles.length;

    for (const vehicle of vehicles) {
      const vehicleId = vehicle._id;
      if (!vehicleId) continue;

      try {
        const produced = await this.generateForVehicle(
          tenantId,
          String(vehicleId),
          vehicle.license_plate,
          { now, config }
        );
        if (produced.readingCount > 0) result.vehiclesWithReadings += 1;
        result.tripsCreated += produced.created;
        result.tripsAlreadyPresent += produced.alreadyPresent;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`${vehicle.license_plate}: ${message}`);
        monitoring.logError('[TripGeneration] Vehicle sweep failed', error as Error, {
          tenantId,
          vehicleId: String(vehicleId),
        });
      }
    }

    return result;
  }

  async generateForVehicle(
    tenantId: string,
    vehicleId: string,
    licensePlate: string,
    options: { now?: Date; config?: TripDetectionConfig } = {}
  ): Promise<{ created: number; alreadyPresent: number; readingCount: number }> {
    const now = options.now ?? new Date();
    const config = options.config ?? DEFAULT_TRIP_DETECTION_CONFIG;

    const state = await tripDetectionStateRepository.get(tenantId, vehicleId);

    const since = state.lastProcessedAt
      ? new Date(state.lastProcessedAt.getTime() - WATERMARK_OVERLAP_MINUTES * 60_000)
      : new Date(now.getTime() - FIRST_RUN_LOOKBACK_HOURS * 3_600_000);

    const db = await connectToDatabase();
    const raw = (await db
      .collection('tbltelematics')
      .find({
        tenantId,
        vehicleId,
        isDeleted: { $ne: true },
        timestamp: { $gt: since, $lte: now },
      })
      // ASCENDING. The detector requires time order and its whole
      // stop/gap logic is a comparison against the previous reading --
      // the repository's own history method sorts descending for the UI,
      // which would make every interval negative.
      .sort({ timestamp: 1 })
      .limit(MAX_READINGS_PER_VEHICLE_PER_RUN)
      .toArray()) as unknown as RawReading[];

    if (raw.length === 0) {
      return { created: 0, alreadyPresent: 0, readingCount: 0 };
    }

    const { trips, state: nextState } = detectTrips(
      raw.map(toDetectionReading),
      state,
      config
    );

    let created = 0;
    let alreadyPresent = 0;

    if (trips.length > 0) {
      const ownership = await resolveAlertOwnership(vehicleId, tenantId);
      for (const trip of trips) {
        const outcome = await this.persist(
          tenantId,
          vehicleId,
          licensePlate,
          trip,
          ownership.orgUnitId
        );
        if (outcome === 'created') created += 1;
        else alreadyPresent += 1;
      }
    }

    // Saved AFTER the writes: if persisting throws, the watermark does
    // not advance and the next run reconsiders the same readings. That
    // direction is safe because trip identity is enforced by the unique
    // index; the reverse would silently lose journeys.
    await tripDetectionStateRepository.save(tenantId, vehicleId, nextState);

    return { created, alreadyPresent, readingCount: raw.length };
  }

  /**
   * Writes one detected trip, or recognises that it is already there.
   *
   * `$setOnInsert` for every field: a re-run must never mutate an
   * existing trip. If detection improves and produces a better distance
   * for a journey already posted to the allocation ledger, changing the
   * row underneath the posting would break the reconciliation. Correcting
   * a generated trip is an explicit operator action, not a side effect of
   * the sweep running again.
   */
  private async persist(
    tenantId: string,
    vehicleId: string,
    licensePlate: string,
    trip: DetectedTrip,
    orgUnitId: string | undefined
  ): Promise<'created' | 'exists'> {
    const db = await connectToDatabase();
    const key = tripGenerationKey(tenantId, vehicleId, trip.startAt);

    const doc: Partial<Trip> & Record<string, unknown> = {
      tenantId,
      license_plate: licensePlate.toUpperCase(),
      ...(orgUnitId ? { orgUnitId } : {}),

      // `date` is what every existing trip query and aggregate filters
      // on; start_time is the precise instant. Both are set so a
      // generated trip behaves identically to a manual one everywhere.
      date: trip.startAt,
      start_time: trip.startAt,
      end_time: trip.endAt,
      duration_minutes: Math.round(trip.durationMinutes),

      /**
       * `distance_calculated` is REQUIRED by the Trip type and is summed
       * by every distance aggregate, so an unmeasurable trip stores 0
       * there -- but `distance_km_known: false` records that the 0 is an
       * absence rather than a measurement, and `trip_distance` is left
       * unset. Consumers that must not average a fabricated zero read
       * the flag. This is the one place the codebase's "never write 0
       * for unknown" rule is bent, and it is bent because the field is
       * non-optional in a shipped schema; the flag is how it stays
       * honest.
       */
      distance_calculated: trip.distanceKm ?? 0,
      ...(trip.distanceKm !== null ? { trip_distance: trip.distanceKm } : {}),
      distance_km_known: trip.distanceKm !== null,
      distance_source: trip.distanceSource,

      mode: trip.distanceSource === 'odometer' ? 'odometer' : 'distance',
      unit_id: 'km',
      status: 'completed',
      created_from: 'gps',

      ...(trip.averageSpeedKmh !== null ? { average_speed: trip.averageSpeedKmh } : {}),
      ...(trip.maxSpeedKmh !== null ? { max_speed: trip.maxSpeedKmh } : {}),
      ...(trip.startLat !== undefined && trip.startLng !== undefined
        ? { start_lat: trip.startLat, start_lng: trip.startLng }
        : {}),
      ...(trip.endLat !== undefined && trip.endLng !== undefined
        ? { end_lat: trip.endLat, end_lng: trip.endLng }
        : {}),

      generation_key: key,
      generation_end_reason: trip.endReason,
      generation_reading_count: trip.readingCount,
      /** The vehicle's canonical id, so playback can query telemetry without a plate lookup. */
      generation_vehicle_id: vehicleId,

      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'system:trip-generation',
      updatedBy: 'system:trip-generation',
    };

    const outcome = await db.collection('tbltrips').updateOne(
      { tenantId, generation_key: key },
      { $setOnInsert: doc },
      { upsert: true }
    );

    if (!outcome.upsertedId) return 'exists';

    // Published only for a genuinely new trip, so a re-run does not
    // re-fire maintenance forecasting for journeys already accounted for.
    try {
      const bus = EventBusFactory.getInstance();
      await bus.publish(
        new TripCreatedEvent(
          { ...doc, _id: String(outcome.upsertedId) } as unknown as Trip,
          { tenantId, userId: 'system:trip-generation' }
        )
      );
    } catch (error) {
      monitoring.logError('[TripGeneration] TripCreated publish failed (non-fatal)', error as Error, {
        tenantId,
        generationKey: key,
      });
    }

    return 'created';
  }
}

export const tripGenerationService = new TripGenerationService();
