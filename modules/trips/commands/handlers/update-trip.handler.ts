// modules/trips/commands/handlers/update-trip.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { UpdateTripCommand } from '../update-trip.command';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { tripUpdateSchema } from '@/shared/validations/trip.schema';
import { Trip } from '@/shared/types/trip.types';
import { NotFoundError, ValidationError, AppError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { TripUpdatedEvent } from '@/modules/trips/events/TripUpdatedEvent';

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
] as const;

export class UpdateTripHandler implements ICommandHandler<UpdateTripCommand, Trip> {
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(command: UpdateTripCommand): Promise<Trip> {
    const raw = command.rawData as Record<string, unknown>;
    const clean: Record<string, unknown> = { _id: command.tripId };

    for (const field of ALLOWED_FIELDS) {
      if (raw[field] !== undefined) {
        const numericFields = ['trip_distance', 'start_odometer', 'end_odometer'];
        clean[field] = numericFields.includes(field) && raw[field] !== ''
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
      const vehicle = await db.collection('tblvehicles').findOne({
        license_plate: String(updateData.license_plate).toUpperCase(),
        isDeleted: { $ne: true },
      });
      if (!vehicle) {
        throw new AppError(
          `Vehicle "${updateData.license_plate}" not found`,
          'VEHICLE_NOT_FOUND',
          400
        );
      }
      updateData.license_plate = String(updateData.license_plate).toUpperCase();
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

    const mode = updateData.mode as string | undefined;
    if (mode === 'distance' && updateData.trip_distance != null) {
      updateData.distance_calculated = Number(updateData.trip_distance);
      updateData.start_odometer = null;
      updateData.end_odometer = null;
    } else if (mode === 'odometer') {
      const start = updateData.start_odometer != null ? Number(updateData.start_odometer) : null;
      const end = updateData.end_odometer != null ? Number(updateData.end_odometer) : null;
      if (start != null && end != null) {
        if (end < start) {
          throw new ValidationError('End odometer cannot be less than start odometer');
        }
        updateData.distance_calculated = end - start;
      }
      updateData.trip_distance = null;
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