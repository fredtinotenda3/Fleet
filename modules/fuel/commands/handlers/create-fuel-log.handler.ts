// modules/fuel/commands/handlers/create-fuel-log.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { CreateFuelLogCommand } from '../create-fuel-log.command';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { fuelLogCreateSchema } from '@/shared/validations/fuel.schema';
import { FuelLog } from '@/shared/types/fuel.types';
import { ValidationError, AppError } from '@/server/errors/app.errors';
import { validateWithZod } from '@/shared/utils/validation.utils';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { FuelLoggedEvent } from '@/modules/fuel/events/FuelLoggedEvent';

export class CreateFuelLogHandler implements ICommandHandler<CreateFuelLogCommand, FuelLog> {
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(command: CreateFuelLogCommand): Promise<FuelLog> {
    const raw = command.rawData as Record<string, unknown>;

    const clean: Record<string, unknown> = {
      license_plate: raw.license_plate,
      date: raw.date,
      fuel_volume: typeof raw.fuel_volume === 'string' ? Number(raw.fuel_volume) : raw.fuel_volume,
      unit_id: raw.unit_id,
      cost: typeof raw.cost === 'string' ? Number(raw.cost) : raw.cost,
      odometer: raw.odometer !== undefined && raw.odometer !== '' ? Number(raw.odometer) : undefined,
      station_name: raw.station_name,
      fuel_station_id: raw.fuel_station_id,
      fuel_type: raw.fuel_type,
      notes: raw.notes,
      currency: raw.currency,
      is_full_tank: typeof raw.is_full_tank === 'string' ? raw.is_full_tank === 'true' : raw.is_full_tank,
      receipt_url: raw.receipt_url,
      payment_method: raw.payment_method || 'cash',
      fuel_card_id: raw.fuel_card_id,
    };

    const payload = Object.fromEntries(
      Object.entries(clean).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );

    const result = await validateWithZod(fuelLogCreateSchema, payload);
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
      throw new AppError(`Vehicle "${validated.license_plate}" not found`, 'VEHICLE_NOT_FOUND', 400);
    }

    const unit = await db.collection('tblunits').findOne({ unit_id: validated.unit_id });
    if (!unit) {
      throw new AppError(`Unit "${validated.unit_id}" not found`, 'UNIT_NOT_FOUND', 400);
    }

    if (validated.fuel_station_id) {
      const station = await db.collection('tblfuelstations').findOne({
        _id: validated.fuel_station_id as any,
        tenantId: command.tenantId,
        isDeleted: { $ne: true },
      });
      if (!station) {
        throw new AppError('Selected fuel station was not found', 'FUEL_STATION_NOT_FOUND', 400);
      }
    }

    if (validated.payment_method === 'fuel_card' && validated.fuel_card_id) {
      const card = await db.collection('tblfuelcards').findOne({
        _id: validated.fuel_card_id as any,
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

    const fuelData: Omit<FuelLog, '_id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt'> = {
      tenantId: command.tenantId,
      license_plate: String(validated.license_plate).toUpperCase(),
      date: new Date(validated.date as unknown as string),
      fuel_volume: Number(validated.fuel_volume),
      unit_id: String(validated.unit_id),
      cost: Number(validated.cost),
      payment_method: validated.payment_method,
      ...(validated.odometer != null && { odometer: Number(validated.odometer) }),
      ...(validated.station_name && { station_name: String(validated.station_name) }),
      ...(validated.fuel_station_id && { fuel_station_id: String(validated.fuel_station_id) }),
      ...(validated.fuel_type && { fuel_type: String(validated.fuel_type) }),
      ...(validated.notes && { notes: String(validated.notes) }),
      ...(validated.currency && { currency: String(validated.currency) }),
      ...(validated.is_full_tank !== undefined &&
        validated.is_full_tank !== null && { is_full_tank: Boolean(validated.is_full_tank) }),
      ...(validated.receipt_url && { receipt_url: String(validated.receipt_url) }),
      ...(validated.fuel_card_id && { fuel_card_id: String(validated.fuel_card_id) }),
    };

    const created = await this.fuelRepo.create(fuelData, command.tenantId, command.userId);

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(
      new FuelLoggedEvent(created, {
        tenantId: command.tenantId,
        userId: command.userId,
        correlationId: command.commandName,
      })
    );

    return created;
  }
}