/* eslint-disable @typescript-eslint/no-unused-vars */
// modules/fuel-stations/services/fuel-station.service.ts

import { fuelStationRepository, FuelStationRepository } from '../repositories/fuel-station.repository';
import { fuelStationCreateSchema, fuelStationUpdateSchema } from '@/shared/validations/fuel-station.schema';
import { validateWithZod } from '@/shared/utils/validation.utils';
import { ValidationError, NotFoundError } from '@/server/errors/app.errors';
import { FuelStation, FuelStationFilters } from '@/shared/types/fuel-station.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { FuelStationCreatedEvent } from '../events/FuelStationCreatedEvent';
import { FuelStationUpdatedEvent } from '../events/FuelStationUpdatedEvent';
import { FuelStationDeletedEvent } from '../events/FuelStationDeletedEvent';

// Define the payload type that the repository expects (without fields it generates)
type FuelStationCreatePayload = Omit<FuelStation, '_id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'isDeleted' | 'deletedAt'>;

export class FuelStationService {
  constructor(private readonly repo: FuelStationRepository) {}

  async list(
    filters: FuelStationFilters,
    pagination: PaginationParams,
    tenantId: string
  ): Promise<PaginatedResponse<FuelStation>> {
    return this.repo.getFilteredStations(filters, tenantId, pagination);
  }

  async getById(id: string, tenantId: string): Promise<FuelStation> {
    const station = await this.repo.findById(id, tenantId);
    if (!station) throw new NotFoundError('Fuel station not found');
    return station;
  }

  async create(rawData: unknown, tenantId: string, userId?: string): Promise<FuelStation> {
    const result = await validateWithZod(fuelStationCreateSchema, rawData);
    if (!result.success || !result.data) {
      throw new ValidationError('Validation failed', result.errors || {});
    }

    const payload: FuelStationCreatePayload = {
      tenantId,
      name: result.data.name,
      isActive: result.data.isActive ?? true,
      brand: result.data.brand ?? undefined,
      address: result.data.address ?? undefined,
      city: result.data.city ?? undefined,
      country: result.data.country ?? undefined,
      latitude: result.data.latitude ?? undefined,
      longitude: result.data.longitude ?? undefined,
      phone: result.data.phone ?? undefined,
      notes: result.data.notes ?? undefined,
    };

    const created = await this.repo.create(payload, tenantId, userId);

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new FuelStationCreatedEvent(created, { tenantId, userId }));

    return created;
  }

  async update(id: string, rawData: unknown, tenantId: string, userId?: string): Promise<FuelStation> {
    const result = await validateWithZod(fuelStationUpdateSchema, {
      ...(rawData as Record<string, unknown>),
      _id: id,
    });
    if (!result.success || !result.data) {
      throw new ValidationError('Validation failed', result.errors || {});
    }

    const { _id, ...rest } = result.data;
    
    // Remove null values and convert to undefined for optional fields
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest)) {
      updateData[key] = value === null ? undefined : value;
    }

    const updated = await this.repo.update(
      id,
      updateData as Partial<Omit<FuelStation, '_id' | 'tenantId' | 'createdAt' | 'createdBy'>>,
      tenantId,
      userId
    );
    if (!updated) throw new NotFoundError('Fuel station not found');

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new FuelStationUpdatedEvent(updated, updateData, { tenantId, userId }));

    return updated;
  }

  async remove(id: string, tenantId: string, userId?: string, soft: boolean = true): Promise<void> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Fuel station not found');

    if (soft) await this.repo.softDelete(id, tenantId, userId);
    else await this.repo.hardDelete(id, tenantId);

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new FuelStationDeletedEvent(id, existing.name, tenantId, { userId, soft }));
  }
}

export const fuelStationService = new FuelStationService(fuelStationRepository);