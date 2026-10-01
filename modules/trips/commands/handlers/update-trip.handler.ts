// modules/trips/commands/handlers/update-trip.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { UpdateTripCommand } from '../update-trip.command';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { tripUpdateSchema } from '@/shared/validations/trip.schema';
import { Trip } from '@/shared/types/trip.types';
import '@/shared/types/trip.map-assisted-addendum';
import { NotFoundError, ValidationError, AppError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { vehicleWriteResolver } from '@/modules/vehicles/services/vehicle-write-resolver.service';
import { driverWriteResolver } from '@/modules/drivers/services/driver-write-resolver.service';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { TripUpdatedEvent } from '@/modules/trips/events/TripUpdatedEvent';
import { routeDistanceService } from '@/modules/telematics/services/route-distance.service';
import {
  resolveSelectedDistance,
  buildDistanceMeasurement,
} from '@/modules/trips/services/distance-source-resolver.service';
import type { TripStop } from '@/shared/types/evidence.types';

const ALLOWED_FIELDS = [
  'license_plate',
  'mode',
  'date',
  'unit_id',
  'notes',
  'start_location',
  'end_location',
  'driver_id',
  'trip_distance',
  'start_odometer',
  'end_odometer',
  // --- PHASE 1 additions ---
  'status',
  'start_time',
  'end_time',
  'trip_type',
  'routeId',
  // --- PART 3: map-assisted trip log ---
  'stops',
] as const;

const NUMERIC_FIELDS = ['trip_distance', 'start_odometer', 'end_odometer'];

/** Same derivation used in CreateTripHandler -- see that file for rationale. */
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

export class UpdateTripHandler implements ICommandHandler<UpdateTripCommand, Trip> {
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(command: UpdateTripCommand): Promise<Trip> {
    const raw = command.rawData as Record<string, unknown>;
    const clean: Record<string, unknown> = { _id: command.tripId };

    for (const field of ALLOWED_FIELDS) {
      if (raw[field] !== undefined) {
        clean[field] = NUMERIC_FIELDS.includes(field) && raw[field] !== ''
          ? Number(raw[field])
          : raw[field];
      }
    }

    const result = await validateWithZod(tripUpdateSchema, clean);
    if (!result.success || !result.data) {
      const fieldErrors = result.errors || {};
      const messages = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${errs.join(', ')}`)
        .join('; ');
      throw new ValidationError(messages || 'Validation failed', fieldErrors);
    }

    const { _id, ...updateData } = result.data as Record<string, unknown>;
    const db = await connectToDatabase();

    if (updateData.license_plate) {
      /**
       * SCOPE FIX -- re-plating a trip rewrites its orgUnitId, moving
       * it (and its distance, which feeds cost/km) between branches.
       * See server/tenancy/write-scope.ts.
       */
      const vehicle = await vehicleWriteResolver.resolveForWrite(
        String(updateData.license_plate),
        command.scope
      );
      updateData.license_plate = String(updateData.license_plate).toUpperCase();
      updateData.orgUnitId = vehicleWriteResolver.orgUnitIdFor(vehicle) ?? null;
    }

    if (updateData.unit_id) {
      const unit = await db.collection('tblunits').findOne({
        unit_id: updateData.unit_id,
        type: 'distance',
      });
      if (!unit) {
        throw new AppError(
          `Unit "${updateData.unit_id}" not found or is not a distance unit`,
          'UNIT_NOT_FOUND',
          400
        );
      }
    }

    /**
     * PHASE 1 (validation gap closed -- see CreateTripHandler for the
     * matching create-side fix). An empty string clears the driver
     * assignment and is intentionally not checked against tbldrivers.
     */
    if (updateData.driver_id) {
      /**
       * Same three fixes as CreateTripHandler: a string was compared
       * against an ObjectId `_id` (so this check could never pass), the
       * lookup crossed tenants, and it ignored org-unit scope entirely.
       * driverWriteResolver handles all three, and reports an
       * out-of-scope driver as not-found so the error is not an
       * enumeration oracle.
       */
      await driverWriteResolver.resolveForWrite(
        String(updateData.driver_id),
        command.scope
      );
    }

    const mode = updateData.mode as string | undefined;
    if (mode === 'map') {
      /**
       * PART 3/5: editing a map-assisted trip's stops must re-run the
       * SAME server-side routing call create does -- never trust a
       * client-submitted distance for this mode, and never leave the
       * trip's distance stale relative to its own stops after an edit
       * (a changed waypoint with an unchanged distance_calculated would
       * silently corrupt every downstream cost/km figure).
       */
      const stops = (updateData.stops as TripStop[] | undefined) ?? null;
      if (!stops || stops.length < 2) {
        throw new ValidationError('A map-assisted trip needs at least a start and an end stop');
      }
      const sortedStops = [...stops].sort((a, b) => a.sequence - b.sequence);
      const route = await routeDistanceService.computeRoute(
        sortedStops.map((s) => ({ sequence: s.sequence, lat: s.lat, lng: s.lng }))
      );
      if (!route) {
        throw new AppError(
          'A map route could not be calculated for these stops. Check that each stop resolves to a real location, or switch this trip to Direct Distance or Odometer mode instead.',
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
      updateData.distance_calculated = resolved.valueKm ?? 0;
      updateData.distance_source = 'map-derived';
      updateData.distance_km_known = true;
      updateData.distance_evidence = { mapDerived };
      updateData.route = {
        provider: 'osrm',
        calculatedAt: new Date(),
        legs: route.legs,
        totalDistanceKm: route.totalDistanceKm,
        ...(route.geometry ? { geometry: route.geometry } : {}),
      };
      updateData.stops = sortedStops;
      updateData.trip_distance = null;
      updateData.start_odometer = null;
      updateData.end_odometer = null;
    } else if (mode === 'distance' && updateData.trip_distance != null) {
      updateData.distance_calculated = Number(updateData.trip_distance);
      updateData.start_odometer = null;
      updateData.end_odometer = null;
      updateData.distance_source = 'manual';
      updateData.distance_km_known = true;
      updateData.distance_evidence = {
        manual: buildDistanceMeasurement(Number(updateData.trip_distance), 'manual', 'Manually entered'),
      };
      updateData.route = null;
      updateData.stops = null;
    } else if (mode === 'odometer') {
      const start = updateData.start_odometer != null ? Number(updateData.start_odometer) : null;
      const end = updateData.end_odometer != null ? Number(updateData.end_odometer) : null;
      if (start != null && end != null) {
        if (end < start) {
          throw new ValidationError('End odometer cannot be less than start odometer');
        }
        updateData.distance_calculated = end - start;
        updateData.distance_source = 'odometer';
        updateData.distance_km_known = true;
        updateData.distance_evidence = {
          odometer: buildDistanceMeasurement(end - start, 'odometer', 'End odometer − start odometer'),
        };
      }
      updateData.trip_distance = null;
      updateData.route = null;
      updateData.stops = null;
    } else if (!mode) {
      if (updateData.trip_distance != null) {
        updateData.distance_calculated = Number(updateData.trip_distance);
      } else if (
        updateData.start_odometer != null &&
        updateData.end_odometer != null
      ) {
        const start = Number(updateData.start_odometer);
        const end = Number(updateData.end_odometer);
        if (end < start) {
          throw new ValidationError('End odometer cannot be less than start odometer');
        }
        updateData.distance_calculated = end - start;
      }
    }

    /**
     * PHASE 1: recompute duration/average_speed whenever start_time,
     * end_time, or the distance changed. If only one of start/end time
     * is supplied on this update we can't recompute against the other
     * (unknown) side, so we leave the existing stored value alone --
     * TripCommandService always sends full objects only where the
     * caller explicitly changed something, and a partial time edit
     * without the paired value is treated as "not enough information
     * to recompute" rather than silently zeroing out duration.
     */
    if (updateData.start_time !== undefined || updateData.end_time !== undefined) {
      const startTime = updateData.start_time ? new Date(updateData.start_time as string) : undefined;
      const endTime = updateData.end_time ? new Date(updateData.end_time as string) : undefined;
      if (startTime && endTime) {
        const distanceForTiming =
          (updateData.distance_calculated as number | undefined) ?? undefined;
        if (distanceForTiming != null) {
          const timing = calculateTiming(startTime, endTime, distanceForTiming);
          if (timing.duration_minutes != null) updateData.duration_minutes = timing.duration_minutes;
          if (timing.average_speed != null) updateData.average_speed = timing.average_speed;
        }
      }
    }

    const updated = await this.tripRepo.update(
      command.tripId,
      updateData as Partial<Omit<Trip, '_id' | 'tenantId' | 'createdAt' | 'createdBy'>>,
      command.tenantId,
      command.userId
    );

    if (!updated) {
      throw new NotFoundError('Trip not found');
    }

    // Emit event
    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new TripUpdatedEvent(updated, updateData, {
      tenantId: command.tenantId,
      userId: command.userId,
      correlationId: command.commandName,
    }));

    return updated;
  }
}
