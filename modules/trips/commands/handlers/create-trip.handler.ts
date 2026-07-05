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

    const distance_calculated = calculateDistance({
      mode: validated.mode,
      trip_distance: validated.trip_distance ?? null,
      start_odometer: validated.start_odometer ?? null,
      end_odometer: validated.end_odometer ?? null,
    });

    if (distance_calculated <= 0) {
      throw new ValidationError('Calculated distance must be greater than 0');
    }

    const tripData: Omit<Trip, '_id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt'> = {
      tenantId: command.tenantId,
      license_plate: String(validated.license_plate).toUpperCase(),
      mode: validated.mode,
      date: new Date(validated.date as unknown as string),
      unit_id: String(validated.unit_id),
      distance_calculated,
      ...(validated.trip_distance != null && { trip_distance: Number(validated.trip_distance) }),
      ...(validated.start_odometer != null && { start_odometer: Number(validated.start_odometer) }),
      ...(validated.end_odometer != null && { end_odometer: Number(validated.end_odometer) }),
      ...(validated.notes && { notes: String(validated.notes) }),
      ...(validated.start_location && { start_location: String(validated.start_location) }),
      ...(validated.end_location && { end_location: String(validated.end_location) }),
      ...(validated.driver_id && { driver_id: String(validated.driver_id) }),
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