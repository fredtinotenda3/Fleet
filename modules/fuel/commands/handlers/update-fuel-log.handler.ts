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
import { ObjectId } from 'mongodb';
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
  'fuel_station_id',
  'fuel_type',
  'currency',
  'is_full_tank',
  'receipt_url',
  'payment_method',
  'fuel_card_id',
  // FIX: driver_id was missing from this list entirely -- a fuel log's
  // driver could be set at creation but never corrected, cleared, or
  // reassigned via update. Any log created with the wrong (or no)
  // driver stayed that way permanently.
  'driver_id',
] as const;

export class UpdateFuelLogHandler implements ICommandHandler<UpdateFuelLogCommand, FuelLog> {
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
      updateData.orgUnitId = (vehicle as { orgUnitId?: string }).orgUnitId ?? null;
    }

    if (updateData.unit_id) {
      const unit = await db.collection('tblunits').findOne({ unit_id: updateData.unit_id });
      if (!unit) {
        throw new AppError(`Unit "${updateData.unit_id}" not found`, 'UNIT_NOT_FOUND', 400);
      }
    }

    if (updateData.fuel_station_id) {
      // FIX: same ObjectId-vs-string mismatch as the create handler --
      // tblfuelstations._id is an ObjectId, updateData.fuel_station_id
      // is a string, and the raw MongoDB driver does not auto-cast.
      const stationIdStr = String(updateData.fuel_station_id);
      if (!ObjectId.isValid(stationIdStr)) {
        throw new AppError('Selected fuel station was not found', 'FUEL_STATION_NOT_FOUND', 400);
      }
      const station = await db.collection('tblfuelstations').findOne({
        _id: new ObjectId(stationIdStr),
        tenantId: command.tenantId,
        isDeleted: { $ne: true },
      });
      if (!station) {
        throw new AppError('Selected fuel station was not found', 'FUEL_STATION_NOT_FOUND', 400);
      }
    }

    if (updateData.payment_method === 'fuel_card' && updateData.fuel_card_id) {
      // FIX: same ObjectId-vs-string mismatch.
      const cardIdStr = String(updateData.fuel_card_id);
      if (!ObjectId.isValid(cardIdStr)) {
        throw new AppError('Selected fuel card was not found', 'FUEL_CARD_NOT_FOUND', 400);
      }
      const card = await db.collection('tblfuelcards').findOne({
        _id: new ObjectId(cardIdStr),
        tenantId: command.tenantId,
        isDeleted: { $ne: true },
      });
      if (!card) {
        throw new AppError('Selected fuel card was not found', 'FUEL_CARD_NOT_FOUND', 400);
      }
      if (card.status !== 'active') {
        throw new AppError('Selected fuel card is not active', 'FUEL_CARD_INACTIVE', 400);
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
    await eventBus.publish(
      new FuelLogUpdatedEvent(updated, updateData, {
        tenantId: command.tenantId,
        userId: command.userId,
        correlationId: command.commandName,
      })
    );

    return updated;
  }
}