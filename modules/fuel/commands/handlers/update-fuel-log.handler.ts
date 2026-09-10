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
import { vehicleWriteResolver } from '@/modules/vehicles/services/vehicle-write-resolver.service';
import { driverWriteResolver } from '@/modules/drivers/services/driver-write-resolver.service';

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

/**
 * Fields an update may explicitly REMOVE by sending an empty value.
 *
 * The loop below skips `''` for every other field, which is right: an
 * empty license plate or an empty date is a malformed submission, not an
 * instruction to blank the column. But for an optional foreign key,
 * "skip empty values" and "you can never undo this" are the same rule.
 * A fuel log attributed to the wrong driver could be pointed at a
 * different driver but never returned to unattributed, which matters
 * because the alternative -- leaving a known-wrong driver on the record
 * -- corrupts that driver's cost and scorecard figures.
 *
 * Deliberately narrow. fuel_card_id is not here because clearing it
 * while payment_method is 'fuel_card' would leave the record failing its
 * own schema refinement; that pairing needs a UI that changes both, not
 * a blanket clear.
 */
const CLEARABLE_FIELDS = new Set<string>(['driver_id']);

export class UpdateFuelLogHandler implements ICommandHandler<UpdateFuelLogCommand, FuelLog> {
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(command: UpdateFuelLogCommand): Promise<FuelLog> {
    const raw = command.rawData as Record<string, unknown>;
    const clean: Record<string, unknown> = { _id: command.fuelLogId };

    for (const field of UPDATABLE_FIELDS) {
      const value = raw[field];
      if (value === undefined) continue;

      if (value === '' || value === null) {
        // An explicit clear, but only for the fields where "empty" is a
        // meaningful instruction rather than a malformed submission.
        if (CLEARABLE_FIELDS.has(field)) clean[field] = null;
        continue;
      }

      clean[field] = value;
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
      /**
       * SCOPE FIX -- see the equivalent note in create-fuel-log.handler.ts.
       * This path is the sharper of the two: the line below REWRITES the
       * record's orgUnitId from the newly named vehicle, so an unscoped
       * lookup here does not merely misfile a new record, it MOVES an
       * existing one between branches (or, on a plate collision, onto a
       * unit belonging to another tenant entirely).
       */
      const vehicle = await vehicleWriteResolver.resolveForWrite(
        String(updateData.license_plate),
        command.scope
      );
      updateData.license_plate = String(updateData.license_plate).toUpperCase();
      /**
       * Kept as `?? null` rather than omitting the key: this is an
       * update, and leaving the field out would silently retain the OLD
       * vehicle's org unit on a record that now belongs to a different
       * vehicle. An explicit null is the honest representation of "this
       * vehicle has no unit yet" and matches what the scoped read treats
       * as unassigned.
       */
      updateData.orgUnitId = vehicleWriteResolver.orgUnitIdFor(vehicle) ?? null;
    }

    /**
     * A newly named driver is resolved under the caller's scope, exactly
     * as on create. `null` is left alone -- clearing an attribution
     * needs no lookup, and requiring one would make an unattributable
     * log uncorrectable.
     */
    if (updateData.driver_id != null) {
      await driverWriteResolver.resolveForWrite(String(updateData.driver_id), command.scope);
      updateData.driver_id = String(updateData.driver_id);
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