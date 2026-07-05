import { ICommandHandler } from '@/server/cqrs/command';
import { CreateVehicleCommand } from '../create-vehicle.command';
import { VehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { vehicleCreateSchema } from '@/shared/validations/vehicle.schema';
import { Vehicle } from '@/shared/types/vehicle.types';
import { ConflictError, ValidationError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { VehicleCreatedEvent } from '@/modules/vehicles/events/VehicleCreatedEvent';

export class CreateVehicleHandler
  implements ICommandHandler<CreateVehicleCommand, Vehicle>
{
  constructor(private readonly vehicleRepo: VehicleRepository) {}

  async execute(command: CreateVehicleCommand): Promise<Vehicle> {
    const raw = command.rawData as Record<string, unknown>;

    const clean: Record<string, unknown> = {
      license_plate: raw.license_plate,
      make: raw.make,
      model: raw.model,
      year: typeof raw.year === 'string' ? parseInt(raw.year as string, 10) : raw.year,
      vehicle_type: raw.vehicle_type,
      purchase_date: raw.purchase_date,
      fuel_type: raw.fuel_type,
      color: raw.color ?? '#3b82f6',
      vin: raw.vin,
      status: raw.status ?? 'active',
      registration_expiry: raw.registration_expiry,
      insurance_provider: raw.insurance_provider,
      service_interval: raw.service_interval,
      odometer: raw.odometer,
    };

    const payload = Object.fromEntries(
      Object.entries(clean).filter(([, v]) => v !== undefined)
    );

    const result = await validateWithZod(vehicleCreateSchema, payload);
    if (!result.success || !result.data) {
      const fieldErrors = result.errors || {};
      const messages = Object.entries(fieldErrors)
        .map(([field, errs]) => `${field}: ${errs.join(', ')}`)
        .join('; ');
      throw new ValidationError(messages || 'Validation failed', fieldErrors);
    }

    const validated = result.data;

    const existing = await this.vehicleRepo.findByLicensePlate(
      validated.license_plate,
      command.tenantId
    );
    if (existing) {
      throw new ConflictError(
        `Vehicle with license plate "${validated.license_plate}" already exists`
      );
    }

    const created = await this.vehicleRepo.create(
      validated as Omit<Vehicle, '_id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt'>,
      command.tenantId,
      command.userId
    );

    // Emit event
    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new VehicleCreatedEvent(created, {
      tenantId: command.tenantId,
      userId: command.userId,
      correlationId: command.commandName,
    }));

    return created;
  }
}