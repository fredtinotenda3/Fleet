// modules/trips/commands/handlers/create-trip.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { CreateTripCommand } from '../create-trip.command';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { tripCreateSchema } from '@/shared/validations/trip.schema';
import { Trip } from '@/shared/types/trip.types';
import { ValidationError, AppError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { TripCreatedEvent } from '@/modules/trips/events/TripCreatedEvent';

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

    const vehicle = await db.collection('tblvehicles').findOne({
      license_plate: String(validated.license_plate).toUpperCase(),
      isDeleted: { $ne: true },
    });
    if (!vehicle) {
      throw new AppError(
        `Vehicle "${validated.license_plate}" not found`,
        'VEHICLE_NOT_FOUND',
        400
      );
    }

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
      const driver = await db.collection('tbldrivers').findOne({
        _id: validated.driver_id as any,
        isDeleted: { $ne: true },
      });
      if (!driver) {
        throw new AppError(
          `Driver "${validated.driver_id}" not found`,
          'DRIVER_NOT_FOUND',
          400
        );
      }
    }

    const distance_calculated = calculateDistance({
      mode: validated.mode,
      trip_distance: validated.trip_distance ?? null,
      start_odometer: validated.start_odometer ?? null,
      end_odometer: validated.end_odometer ?? null,
    });

    if (distance_calculated <= 0) {
      throw new ValidationError('Calculated distance must be greater than 0');
    }

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
      ...((vehicle as { orgUnitId?: string }).orgUnitId && {
        orgUnitId: (vehicle as { orgUnitId?: string }).orgUnitId,
      }),
      ...(validated.trip_distance != null && { trip_distance: Number(validated.trip_distance) }),
      ...(validated.start_odometer != null && { start_odometer: Number(validated.start_odometer) }),
      ...(validated.end_odometer != null && { end_odometer: Number(validated.end_odometer) }),
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
