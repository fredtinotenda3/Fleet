/* eslint-disable @typescript-eslint/no-unused-vars */
// modules/vehicles/commands/handlers/update-vehicle.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { UpdateVehicleCommand } from '../update-vehicle.command';
import { VehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { vehicleUpdateSchema } from '@/shared/validations/vehicle.schema';
import { Vehicle } from '@/shared/types/vehicle.types';
import { NotFoundError, ValidationError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { VehicleUpdatedEvent } from '@/modules/vehicles/events/VehicleUpdatedEvent';

const ALLOWED_FIELDS = [
  'license_plate',
  'make',
  'model',
  'year',
  'vehicle_type',
  'purchase_date',
  'fuel_type',
  'color',
  'vin',
  'status',
  'registration_expiry',
  'insurance_provider',
  'service_interval',
  'odometer',
] as const;

export class UpdateVehicleHandler
  implements ICommandHandler<UpdateVehicleCommand, Vehicle>
{
  constructor(private readonly vehicleRepo: VehicleRepository) {}

  async execute(command: UpdateVehicleCommand): Promise<Vehicle> {
    const raw = command.rawData as Record<string, unknown>;
    const clean: Record<string, unknown> = { _id: command.vehicleId };

    for (const field of ALLOWED_FIELDS) {
      if (raw[field] !== undefined) {
        clean[field] =
          field === 'year' && typeof raw[field] === 'string'
            ? parseInt(raw[field] as string, 10)
            : raw[field];
      }
    }

    const result = await validateWithZod(vehicleUpdateSchema, clean);
    if (!result.success || !result.data) {
      const fieldErrors = result.errors || {};
      const messages = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${errs.join(', ')}`)
        .join('; ');
      throw new ValidationError(messages || 'Validation failed', fieldErrors);
    }

    const { _id, ...updateData } = result.data;

    const updated = await this.vehicleRepo.update(
      command.vehicleId,
      updateData as Partial<Omit<Vehicle, '_id' | 'tenantId' | 'createdAt' | 'createdBy'>>,
      command.tenantId,
      command.userId
    );

    if (!updated) {
      throw new NotFoundError('Vehicle not found');
    }

    // Emit event. `updateData` comes from the zod schema (which allows
    // `null` for several nullable-but-optional fields like `color`),
    // while `VehicleUpdatedEvent`'s `changes` param types those fields
    // as `string | undefined` (no null). Cast at this boundary rather
    // than widening Vehicle's own field types just for this one event.
    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new VehicleUpdatedEvent(updated, updateData as Partial<Vehicle>, {
      tenantId: command.tenantId,
      userId: command.userId,
      correlationId: command.commandName,
    }));

    return updated;
  }
}