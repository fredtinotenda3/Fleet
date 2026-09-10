// modules/trips/services/trip-playback.service.ts
//
// Route playback: the telemetry a trip was derived from, returned as an
// ordered track the map can scrub through.
//
// ---------------------------------------------------------------------
// WHY THE ROUTE IS RECONSTRUCTED, NOT STORED
// ---------------------------------------------------------------------
// The obvious design is to store the polyline on the Trip when the trip
// is generated. It was rejected:
//
//   * a busy vehicle produces ~1,700 fixes a day, so storing the path
//     duplicates the largest collection in the database into the second
//     largest, and a single document would grow past Mongo's 16 MB limit
//     on a long haul;
//   * telemetry is already indexed on {tenantId, vehicleId, timestamp},
//     which is exactly this query;
//   * a stored copy goes stale. Eagle Track's history service
//     deliberately BACKFILLS older readings, so a path snapshotted at
//     generation time would be missing fixes that arrived afterwards --
//     and would look authoritative while being incomplete.
//
// So playback reads the readings between the trip's start and end. The
// trip is the index; telemetry is the record.
//
// ---------------------------------------------------------------------
// SCOPE
// ---------------------------------------------------------------------
// The trip is loaded through the ORG-UNIT SCOPED path first, and the
// telemetry read is filtered by the same tenant and the vehicle named on
// that trip. A caller who cannot see the trip never reaches the
// telemetry query, and cannot pass a vehicleId of their own choosing --
// the vehicle comes from the trip record, not from the request.
//
// An out-of-scope trip is reported as NOT FOUND rather than forbidden,
// matching this codebase's rule everywhere else: a distinguishable
// "exists but hidden" response lets a scope-narrowed caller enumerate
// another branch's trips one id at a time.

import connectToDatabase from '@/infrastructure/database/mongodb';
import { NotFoundError } from '@/server/errors/app.errors';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { tripRepository } from '../repositories/trip.repository';
import { Trip } from '@/shared/types/trip.types';
import '@/shared/types/trip.generation-addendum';

/** One sample on the playback track. */
export interface PlaybackPoint {
  /** Milliseconds since the trip started -- what a scrubber seeks on. */
  offsetMs: number;
  timestamp: Date;
  lat: number;
  lng: number;
  /** km/h. Absent when the reading did not report it. */
  speed?: number;
  /** Compass degrees. Absent when unreported -- 0 is due north, not "unknown". */
  heading?: number;
}

export interface TripPlayback {
  tripId: string;
  licensePlate: string;
  vehicleId: string | null;
  startTime: Date | null;
  endTime: Date | null;
  durationMs: number;
  points: PlaybackPoint[];
  /**
   * True when the reading cap was hit and the track was thinned.
   * Explicit so a viewer is never shown a decimated path as though it
   * were the full one.
   */
  downsampled: boolean;
  /** Total readings found before any thinning. */
  sourceReadingCount: number;
  /**
   * Why there is no track, when there is none. An empty `points` array
   * with no explanation is the kind of silence this codebase has been
   * bitten by before.
   */
  emptyReason?: 'no-time-window' | 'no-vehicle-reference' | 'no-readings';
}

/**
 * Cap on returned points.
 *
 * ~1,700 fixes/vehicle/day at the platform's cadence, so a long haul can
 * exceed what is sensible to ship to a browser and draw as a polyline.
 * Above the cap the track is thinned by even sampling -- see
 * `downsamplePoints` for why evenly and not by dropping the tail.
 */
export const MAX_PLAYBACK_POINTS = 1_500;

/**
 * Thins a track to at most `max` points by even sampling.
 *
 * ALWAYS KEEPS THE FIRST AND LAST. A route whose end is missing reads as
 * a vehicle that stopped somewhere it did not, which is worse than a
 * coarse line. Dropping the tail (a plain `.slice(0, max)`) would do
 * exactly that on every long trip.
 *
 * Exported for testing: this is arithmetic, and the boundary cases (a
 * track shorter than the cap, exactly the cap, two points) are where a
 * sampler goes wrong.
 */
export function downsamplePoints<T>(points: T[], max: number): T[] {
  if (points.length <= max || max < 2) return points;

  const out: T[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i += 1) {
    out.push(points[Math.round(i * step)]);
  }
  return out;
}

export class TripPlaybackService {
  /**
   * The playback track for one trip.
   *
   * @throws NotFoundError when the trip does not exist in this tenant OR
   *   is outside the caller's org-unit scope. The two are deliberately
   *   indistinguishable.
   */
  async getPlayback(tripId: string, context: TenantContext): Promise<TripPlayback> {
    const trip = (await tripRepository.findById(tripId, context.organizationId)) as Trip | null;
    if (!trip) throw new NotFoundError('Trip not found');

    /**
     * A trip with NO orgUnitId is reachable only by an org-wide role.
     *
     * This was written here as two checks because the sibling
     * `loadInScopeTrip` helpers allowed unassigned rows and could not
     * tighten before the backfill had run. They have since been closed,
     * so both halves now live in one predicate --
     * tenantScopeService.canAccessRecord -- and the whole codebase has a
     * single answer to "may this caller touch this record".
     */
    if (!tenantScopeService.canAccessRecord(context, trip.orgUnitId)) {
      throw new NotFoundError('Trip not found');
    }

    const startTime = trip.start_time ?? trip.date ?? null;
    const endTime = trip.end_time ?? null;

    const base: TripPlayback = {
      tripId: String(trip._id),
      licensePlate: trip.license_plate,
      vehicleId: trip.generation_vehicle_id ?? null,
      startTime: startTime ? new Date(startTime) : null,
      endTime: endTime ? new Date(endTime) : null,
      durationMs:
        startTime && endTime
          ? Math.max(0, new Date(endTime).getTime() - new Date(startTime).getTime())
          : 0,
      points: [],
      downsampled: false,
      sourceReadingCount: 0,
    };

    if (!startTime || !endTime) {
      // A manually entered trip carries a date but no clock times, so
      // there is no window to replay. Said explicitly rather than
      // returning an empty array that looks like "no GPS".
      return { ...base, emptyReason: 'no-time-window' };
    }

    /**
     * The vehicle comes from the TRIP, never from the request.
     *
     * Generated trips carry `generation_vehicle_id`. A manually entered
     * trip has only a plate, so it is resolved here -- tenant-scoped,
     * and only after the trip has already passed the scope check above.
     */
    let vehicleId = trip.generation_vehicle_id ?? null;
    if (!vehicleId) {
      const { vehicleRepository } = await import(
        '@/modules/vehicles/repositories/vehicle.repository'
      );
      const vehicle = await vehicleRepository.findByLicensePlate(
        trip.license_plate,
        context.organizationId
      );
      vehicleId = vehicle?._id ?? null;
    }

    if (!vehicleId) return { ...base, emptyReason: 'no-vehicle-reference' };

    const db = await connectToDatabase();
    const readings = (await db
      .collection('tbltelematics')
      .find(
        {
          tenantId: context.organizationId,
          vehicleId,
          isDeleted: { $ne: true },
          timestamp: { $gte: new Date(startTime), $lte: new Date(endTime) },
        },
        { projection: { timestamp: 1, location: 1 } }
      )
      // ASCENDING -- a scrubber needs time order, and the repository's
      // own history method sorts descending for the list UI.
      .sort({ timestamp: 1 })
      // A hard ceiling well above the cap, so a pathological vehicle
      // cannot pull an unbounded result set into memory before thinning.
      .limit(MAX_PLAYBACK_POINTS * 8)
      .toArray()) as unknown as Array<{
      timestamp: Date;
      location?: { lat?: number; lng?: number; speed?: number; heading?: number };
    }>;

    const startMs = new Date(startTime).getTime();

    const located = readings
      .filter(
        (r) =>
          typeof r.location?.lat === 'number' && typeof r.location?.lng === 'number'
      )
      .map<PlaybackPoint>((r) => ({
        offsetMs: new Date(r.timestamp).getTime() - startMs,
        timestamp: new Date(r.timestamp),
        lat: r.location!.lat as number,
        lng: r.location!.lng as number,
        // Neither is defaulted. `speed: 0` reads as stationary and
        // `heading: 0` points every unreported vehicle due north.
        ...(typeof r.location!.speed === 'number' ? { speed: r.location!.speed } : {}),
        ...(typeof r.location!.heading === 'number' ? { heading: r.location!.heading } : {}),
      }));

    if (located.length === 0) {
      return { ...base, vehicleId, emptyReason: 'no-readings' };
    }

    const points = downsamplePoints(located, MAX_PLAYBACK_POINTS);

    return {
      ...base,
      vehicleId,
      points,
      downsampled: points.length < located.length,
      sourceReadingCount: located.length,
    };
  }
}

export const tripPlaybackService = new TripPlaybackService();
