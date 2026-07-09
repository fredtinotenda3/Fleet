/* eslint-disable @typescript-eslint/no-unused-vars */
// modules/fuel/commands/handlers/update-fuel-log.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { UpdateFuelLogCommand } from '../update-fuel-log.command';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { fuelLogUpdateSchema } from '@/shared/validations/fuel.schema';
import { FuelLog } from '@/shared/types/fuel.types';
import { NotFoundError, ValidationError, AppError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { FuelLogUpdatedEvent } from '@/modules/fuel/events/FuelLogUpdatedEvent';

const UPDATABLE_FIELDS = [
  'license_plate',
  'date',
  'fuel_volume',
  'unit_id',
  'cost',
  'odometer',
  'notes',
  'station_name',
  'fuel_type',
  'currency',
  'is_full_tank',
  'receipt_url',
] as const;

export class UpdateFuelLogHandler
  implements ICommandHandler<UpdateFuelLogCommand, FuelLog>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(command: UpdateFuelLogCommand): Promise<FuelLog> {
    const raw = command.rawData as Record<string, unknown>;
    const clean: Record<string, unknown> = { _id: command.fuelLogId };

    for (const field of UPDATABLE_FIELDS) {
      if (raw[field] !== undefined && raw[field] !== '') {
        clean[field] = raw[field];
      }
    }

    const result = await validateWithZod(fuelLogUpdateSchema, clean);
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
        throw new AppError(`Vehicle "${updateData.license_plate}" not found`, 'VEHICLE_NOT_FOUND', 400);
      }
      updateData.license_plate = String(updateData.license_plate).toUpperCase();
    }

    if (updateData.unit_id) {
      const unit = await db.collection('tblunits').findOne({ unit_id: updateData.unit_id });
      if (!unit) {
        throw new AppError(`Unit "${updateData.unit_id}" not found`, 'UNIT_NOT_FOUND', 400);
      }
    }

    const updated = await this.fuelRepo.update(
      command.fuelLogId,
      updateData as Partial<Omit<FuelLog, '_id' | 'tenantId' | 'createdAt' | 'createdBy'>>,
      command.tenantId,
      command.userId
    );

    if (!updated) {
      throw new NotFoundError('Fuel log not found');
    }

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new FuelLogUpdatedEvent(updated, updateData, {
      tenantId: command.tenantId,
      userId: command.userId,
      correlationId: command.commandName,
    }));

    return updated;
  }
}