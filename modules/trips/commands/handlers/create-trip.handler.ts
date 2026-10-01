// modules/trips/commands/handlers/create-trip.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { CreateTripCommand } from '../create-trip.command';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { tripCreateSchema } from '@/shared/validations/trip.schema';
import { Trip } from '@/shared/types/trip.types';
import '@/shared/types/trip.map-assisted-addendum';
import { ValidationError, AppError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { vehicleWriteResolver } from '@/modules/vehicles/services/vehicle-write-resolver.service';
import { driverWriteResolver } from '@/modules/drivers/services/driver-write-resolver.service';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { TripCreatedEvent } from '@/modules/trips/events/TripCreatedEvent';
import { telematicsRepository } from '@/modules/telematics/repositories/telematics.repository';
import { routeDistanceService } from '@/modules/telematics/services/route-distance.service';
import {
  resolveSelectedDistance,
  buildDistanceMeasurement,
} from '@/modules/trips/services/distance-source-resolver.service';
import type { TripDistanceEvidence, TripStop, TripRouteEvidence } from '@/shared/types/evidence.types';

function calculateDistance(data: {
  mode: string;
  trip_distance?: number | null;
  start_odometer?: number | null;
  end_odometer?: number | null;
}): number {
  if (data.mode === 'distance') {
    return Number(data.trip_distance) || 0;
  }
  if (data.mode === 'odometer') {
    const start = Number(data.start_odometer) || 0;
    const end = Number(data.end_odometer) || 0;
    return Math.max(0, end - start);
  }
  return 0;
}

interface ResolvedTripDistanceFields {
  distance_calculated: number;
  distance_source: 'odometer' | 'map-derived' | 'manual';
  distance_evidence: TripDistanceEvidence;
  route?: TripRouteEvidence;
  stops?: TripStop[];
}

/**
 * PART 3/5 -- resolves distance for the THREE entry modes this handler
 * accepts (map/distance/odometer; a telemetry-GENERATED trip never
 * passes through here, see trip-generation.service.ts).
 *
 * For 'map' mode, the server-side routing call is the ONLY source of
 * the distance -- a client-submitted route/distance is never trusted
 * (see TripCreateDTO's doc comment): a caller could otherwise submit a
 * short set of stops alongside a forged large "route" to inflate a
 * cost-per-km report. Stops are re-sorted by `sequence` here before
 * being sent to the routing engine, so submission order never matters.
 *
 * For 'distance'/'odometer' modes this preserves the existing
 * calculateDistance() result exactly (no behaviour change for those two
 * paths) and additionally records it as evidence, so every trip --
 * not only map-assisted ones -- can answer "where did this number come
 * from" (PART 8/9).
 */
async function resolveTripDistance(validated: {
  mode: string;
  trip_distance?: number | null;
  start_odometer?: number | null;
  end_odometer?: number | null;
  stops?: TripStop[] | null;
}): Promise<ResolvedTripDistanceFields> {
  if (validated.mode === 'map') {
    const sortedStops = [...(validated.stops ?? [])].sort((a, b) => a.sequence - b.sequence);

    const route = await routeDistanceService.computeRoute(
      sortedStops.map((s) => ({ sequence: s.sequence, lat: s.lat, lng: s.lng }))
    );

    if (!route) {
      throw new AppError(
        'A map route could not be calculated for these stops. Check that each stop resolves to a real location, or record this trip using Direct Distance or Odometer mode instead.',
        'MAP_ROUTE_UNAVAILABLE',
        422
      );
    }

    const mapDerived = buildDistanceMeasurement(
      route.totalDistanceKm,
      'map-derived',
      `Routing engine (OSRM) over ${sortedStops.length} stops`
    );

    const resolved = resolveSelectedDistance({ mapDerived });

    return {
      distance_calculated: resolved.valueKm ?? 0,
      distance_source: 'map-derived',
      distance_evidence: { mapDerived },
      route: {
        provider: 'osrm',
        calculatedAt: new Date(),
        legs: route.legs,
        totalDistanceKm: route.totalDistanceKm,
        ...(route.geometry ? { geometry: route.geometry } : {}),
      },
      stops: sortedStops,
    };
  }

  const distance_calculated = calculateDistance(validated);

  if (validated.mode === 'odometer') {
    const measurement = buildDistanceMeasurement(
      distance_calculated,
      'odometer',
      'End odometer − start odometer'
    );
    return {
      distance_calculated,
      distance_source: 'odometer',
      distance_evidence: { odometer: measurement },
    };
  }

  // 'distance' mode: a person typed a distance with nothing backing it.
  const measurement = buildDistanceMeasurement(distance_calculated, 'manual', 'Manually entered');
  return {
    distance_calculated,
    distance_source: 'manual',
    distance_evidence: { manual: measurement },
  };
}

/**
 * PHASE 1: duration_minutes and average_speed are always derived
 * server-side, never trusted from the client -- same principle as
 * distance_calculated above. Returns undefined for either when the
 * inputs needed to compute them aren't present, rather than 0, so the
 * KPI aggregation ($ifNull fallbacks in TripRepository.getTripKpis)
 * can distinguish "no timing data" from "zero-duration trip".
 */
function calculateTiming(
  startTime: Date | undefined,
  endTime: Date | undefined,
  distanceCalculated: number
): { duration_minutes?: number; average_speed?: number } {
  if (!startTime || !endTime) return {};
  const durationMs = endTime.getTime() - startTime.getTime();
  if (durationMs <= 0) return {};
  const duration_minutes = durationMs / 60000;
  const hours = duration_minutes / 60;
  const average_speed = hours > 0 ? distanceCalculated / hours : undefined;
  return { duration_minutes, average_speed };
}

export class CreateTripHandler implements ICommandHandler<CreateTripCommand, Trip> {
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(command: CreateTripCommand): Promise<Trip> {
    const raw = command.rawData as Record<string, unknown>;

    const clean: Record<string, unknown> = {
      license_plate: raw.license_plate,
      mode: raw.mode,
      date: raw.date,
      unit_id: raw.unit_id,
      notes: raw.notes,
      start_location: raw.start_location,
      end_location: raw.end_location,
      driver_id: raw.driver_id,
      status: raw.status,
      start_time: raw.start_time,
      end_time: raw.end_time,
      trip_type: raw.trip_type,
      routeId: raw.routeId,
      stops: raw.stops,
      trip_distance:
        raw.trip_distance !== undefined && raw.trip_distance !== ''
          ? Number(raw.trip_distance)
          : undefined,
      start_odometer:
        raw.start_odometer !== undefined && raw.start_odometer !== ''
          ? Number(raw.start_odometer)
          : undefined,
      end_odometer:
        raw.end_odometer !== undefined && raw.end_odometer !== ''
          ? Number(raw.end_odometer)
          : undefined,
    };

    const payload = Object.fromEntries(
      Object.entries(clean).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );

    const result = await validateWithZod(tripCreateSchema, payload);
    if (!result.success || !result.data) {
      const fieldErrors = result.errors || {};
      const messages = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${errs.join(', ')}`)
        .join('; ');
      throw new ValidationError(messages || 'Validation failed', fieldErrors);
    }

    const validated = result.data;
    const db = await connectToDatabase();

    /**
     * SCOPE FIX -- see server/tenancy/write-scope.ts. The resolved
     * vehicle's orgUnitId is copied onto the trip below, so an unscoped
     * lookup here files the trip (and everything downstream that keys
     * off it: distance, cost/km, driver risk) under a foreign org unit.
     */
    const vehicle = await vehicleWriteResolver.resolveForWrite(
      validated.license_plate as string,
      command.scope
    );

    const unit = await db.collection('tblunits').findOne({
      unit_id: validated.unit_id,
      type: 'distance',
    });
    if (!unit) {
      throw new AppError(
        `Unit "${validated.unit_id}" not found or is not a distance unit`,
        'UNIT_NOT_FOUND',
        400
      );
    }

    /**
     * PHASE 1 (validation gap closed): driver_id was previously
     * accepted and stored with no existence check at all -- a typo'd
     * or stale driver ID would silently save and only surface later as
     * a broken join in analytics/drill-down. Mirrors the
     * vehicle/unit existence checks immediately above.
     */
    if (validated.driver_id) {
      /**
       * THREE FIXES, ARRIVED AT OVER TWO ROUNDS.
       *
       * 1. TYPE. This was `findOne({ _id: validated.driver_id as any })`
       *    -- a STRING compared against tbldrivers._id, which Mongo
       *    stores as an ObjectId. Mongo does not coerce between the
       *    two, so the query matched nothing and EVERY trip naming a
       *    driver was rejected with DRIVER_NOT_FOUND. The `as any` is
       *    what let it compile. tbltrips being empty in this
       *    deployment is consistent with that.
       * 2. TENANT. There was no tenantId filter, so a driver belonging
       *    to another tenant would have satisfied the check.
       * 3. ORG UNIT. Fixing 1 and 2 left a branch manager able to name
       *    a driver from another branch -- and every figure derived
       *    from the trip (scorecard, risk, cost per driver) would then
       *    land on a roster they cannot see. The vehicle on this same
       *    record has been scope-checked since last round; the driver
       *    had not been.
       *
       * driverWriteResolver does all three, and reports an out-of-scope
       * driver identically to a missing one so the error cannot be used
       * to enumerate another branch's roster.
       */
      await driverWriteResolver.resolveForWrite(
        String(validated.driver_id),
        command.scope
      );
    }

    const distanceResolution = await resolveTripDistance({
      mode: validated.mode,
      trip_distance: validated.trip_distance ?? null,
      start_odometer: validated.start_odometer ?? null,
      end_odometer: validated.end_odometer ?? null,
      stops: (validated.stops as TripStop[] | undefined) ?? null,
    });
    const { distance_calculated } = distanceResolution;

    if (distance_calculated <= 0) {
      throw new ValidationError('Calculated distance must be greater than 0');
    }

    /**
     * PART 12/20: records, at write time, whether this vehicle had a
     * registered telematics device when this trip was entered -- not
     * derived later from the distance source, so a vehicle that gains a
     * tracker after the fact does not retroactively imply its past
     * manual/map trips secretly had GPS. A device must be `active` to
     * count; a registered-but-offline device still means "no reliable
     * telemetry for this trip" from the operator's point of view.
     */
    const telemetryDevice = await telematicsRepository.getDeviceForVehicle(
      String(vehicle._id),
      command.tenantId
    );
    const telemetry_available = telemetryDevice?.status === 'active';

    const start_time = validated.start_time ? new Date(validated.start_time as unknown as string) : undefined;
    const end_time = validated.end_time ? new Date(validated.end_time as unknown as string) : undefined;
    const timing = calculateTiming(start_time, end_time, distance_calculated);

    /**
     * PHASE 1: duplicate-trip guard at write time, in addition to the
     * read-side exception report (TripRepository.getTripExceptions).
     * Catching this on create is strictly better than only reporting it
     * after the fact, but it's a warning-level AppError (409) rather
     * than a hard block, since legitimate back-to-back short trips with
     * identical distance do happen (e.g. a fixed shuttle route run
     * twice in a day) -- callers can resubmit with `allowDuplicate`.
     */
    if (!raw.allowDuplicate) {
      const dateOnly = new Date(validated.date as unknown as Date);
      const dayStart = new Date(dateOnly);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dateOnly);
      dayEnd.setHours(23, 59, 59, 999);

      const possibleDuplicate = await db.collection('tbltrips').findOne({
        tenantId: command.tenantId,
        isDeleted: { $ne: true },
        license_plate: String(validated.license_plate).toUpperCase(),
        distance_calculated,
        date: { $gte: dayStart, $lte: dayEnd },
      });
      if (possibleDuplicate) {
        throw new AppError(
          `A trip for ${validated.license_plate} on this date with the same distance (${distance_calculated}) already exists. Resubmit with allowDuplicate to override.`,
          'POSSIBLE_DUPLICATE_TRIP',
          409
        );
      }
    }

    const tripData: Omit<Trip, '_id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt'> = {
      tenantId: command.tenantId,
      license_plate: String(validated.license_plate).toUpperCase(),
      mode: validated.mode,
      date: new Date(validated.date as unknown as string),
      unit_id: String(validated.unit_id),
      distance_calculated,
      ...(vehicleWriteResolver.orgUnitIdFor(vehicle) && {
        orgUnitId: vehicleWriteResolver.orgUnitIdFor(vehicle),
      }),
      /**
       * PART 3/5 FIX: these three are mode-specific inputs, not generic
       * "distance figures" -- storing whichever ones happen to be
       * present on the payload regardless of `mode` let a map-assisted
       * trip (whose `distance_calculated` is always server-computed
       * from `stops`) end up ALSO carrying a stray `trip_distance` or
       * odometer pair left over from a form that had previously been in
       * a different mode (TripForm does not clear these fields when the
       * mode selector changes -- see TripForm.tsx). That stray field was
       * never read by anything (distance_calculated is authoritative
       * everywhere), but a raw record/export reader has no way to know
       * that, and it is exactly the kind of "confusing, uninspectable
       * number" PART 8/9's evidence model exists to prevent. Gating by
       * mode here mirrors the discipline UpdateTripHandler already
       * applies when a trip's mode changes.
       */
      ...(validated.mode === 'distance' &&
        validated.trip_distance != null && { trip_distance: Number(validated.trip_distance) }),
      ...(validated.mode === 'odometer' &&
        validated.start_odometer != null && { start_odometer: Number(validated.start_odometer) }),
      ...(validated.mode === 'odometer' &&
        validated.end_odometer != null && { end_odometer: Number(validated.end_odometer) }),
      ...(validated.notes && { notes: String(validated.notes) }),
      ...(validated.start_location && { start_location: String(validated.start_location) }),
      ...(validated.end_location && { end_location: String(validated.end_location) }),
      ...(validated.driver_id && { driver_id: String(validated.driver_id) }),
      // --- PHASE 1 additions ---
      status: (validated.status as Trip['status']) || 'completed',
      ...(start_time && { start_time }),
      ...(end_time && { end_time }),
      ...(timing.duration_minutes != null && { duration_minutes: timing.duration_minutes }),
      ...(timing.average_speed != null && { average_speed: timing.average_speed }),
      ...(validated.trip_type && { trip_type: validated.trip_type as Trip['trip_type'] }),
      ...(validated.routeId && { routeId: String(validated.routeId) }),
      created_from: (raw.created_from as Trip['created_from']) || 'manual',

      // --- PART 3/5/8: distance source hierarchy + evidence ---
      distance_source: distanceResolution.distance_source,
      distance_km_known: true,
      distance_evidence: distanceResolution.distance_evidence,
      telemetry_available,
      ...(distanceResolution.route && { route: distanceResolution.route }),
      ...(distanceResolution.stops && { stops: distanceResolution.stops }),
    };

    const created = await this.tripRepo.create(tripData, command.tenantId, command.userId);

    // Emit event
    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new TripCreatedEvent(created, {
      tenantId: command.tenantId,
      userId: command.userId,
      correlationId: command.commandName,
    }));

    return created;
  }
}
