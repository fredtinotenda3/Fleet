// modules/fuel-cards/services/fuel-card.service.ts

import { fuelCardRepository, FuelCardRepository } from '../repositories/fuel-card.repository';
import { fuelCardCreateSchema, fuelCardUpdateSchema } from '@/shared/validations/fuel-card.schema';
import { validateWithZod } from '@/shared/utils/validation.utils';
import { ValidationError, NotFoundError, AppError } from '@/server/errors/app.errors';
import { FuelCard, FuelCardFilters } from '@/shared/types/fuel-card.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { FuelCardCreatedEvent } from '../events/FuelCardCreatedEvent';
import { FuelCardUpdatedEvent } from '../events/FuelCardUpdatedEvent';
import { FuelCardDeletedEvent } from '../events/FuelCardDeletedEvent';
import connectToDatabase from '@/infrastructure/database/mongodb';

// Define the payload type that the repository expects (without fields it generates)
type FuelCardCreatePayload = Omit<FuelCard, '_id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'isDeleted' | 'deletedAt'>;

export class FuelCardService {
  constructor(private readonly repo: FuelCardRepository) {}

  async list(
    filters: FuelCardFilters,
    pagination: PaginationParams,
    tenantId: string
  ): Promise<PaginatedResponse<FuelCard>> {
    return this.repo.getFilteredCards(filters, tenantId, pagination);
  }

  async getById(id: string, tenantId: string): Promise<FuelCard> {
    const card = await this.repo.findById(id, tenantId);
    if (!card) throw new NotFoundError('Fuel card not found');
    return card;
  }

  async create(rawData: unknown, tenantId: string, userId?: string): Promise<FuelCard> {
    const result = await validateWithZod(fuelCardCreateSchema, rawData);
    if (!result.success || !result.data) {
      throw new ValidationError('Validation failed', result.errors || {});
    }

    if (result.data.license_plate) {
      const db = await connectToDatabase();
      const vehicle = await db.collection('tblvehicles').findOne({
        license_plate: result.data.license_plate.toUpperCase(),
        isDeleted: { $ne: true },
      });
      if (!vehicle) {
        throw new AppError(`Vehicle "${result.data.license_plate}" not found`, 'VEHICLE_NOT_FOUND', 400);
      }
    }

    const payload: FuelCardCreatePayload = {
      tenantId,
      card_last4: result.data.card_last4,
      provider: result.data.provider,
      currency: result.data.currency ?? 'USD',
      license_plate: result.data.license_plate ? result.data.license_plate.toUpperCase() : undefined,
      status: result.data.status ?? 'active',
      monthly_limit: result.data.monthly_limit,
      notes: result.data.notes,
      expiry_date: result.data.expiry_date ? new Date(result.data.expiry_date as string) : undefined,
    };

    const created = await this.repo.create(payload, tenantId, userId);

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new FuelCardCreatedEvent(created, { tenantId, userId }));

    return created;
  }

  async update(id: string, rawData: unknown, tenantId: string, userId?: string): Promise<FuelCard> {
    const result = await validateWithZod(fuelCardUpdateSchema, {
      ...(rawData as Record<string, unknown>),
      _id: id,
    });
    if (!result.success || !result.data) {
      throw new ValidationError('Validation failed', result.errors || {});
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, ...rest } = result.data;
    const updateData: Record<string, unknown> = { ...rest };

    if (updateData.license_plate) {
      const db = await connectToDatabase();
      const vehicle = await db.collection('tblvehicles').findOne({
        license_plate: String(updateData.license_plate).toUpperCase(),
        isDeleted: { $ne: true },
      });
      if (!vehicle) {
        throw new AppError(`Vehicle "${updateData.license_plate}" not found`, 'VEHICLE_NOT_FOUND', 400);
      }
      updateData.license_plate = String(updateData.license_plate).toUpperCase();
    }

    if (updateData.expiry_date) {
      updateData.expiry_date = new Date(updateData.expiry_date as string);
    }

    const updated = await this.repo.update(
      id,
      updateData as Partial<Omit<FuelCard, '_id' | 'createdAt' | 'createdBy'>>,
      tenantId,
      userId
    );
    if (!updated) throw new NotFoundError('Fuel card not found');

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new FuelCardUpdatedEvent(updated, updateData, { tenantId, userId }));

    return updated;
  }

  async remove(id: string, tenantId: string, userId?: string, soft: boolean = true): Promise<void> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Fuel card not found');

    if (soft) await this.repo.softDelete(id, tenantId, userId);
    else await this.repo.hardDelete(id, tenantId);

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new FuelCardDeletedEvent(id, existing.provider, tenantId, { userId, soft }));
  }
}

export const fuelCardService = new FuelCardService(fuelCardRepository);