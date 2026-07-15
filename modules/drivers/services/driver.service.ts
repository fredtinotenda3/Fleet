/* eslint-disable @typescript-eslint/no-unused-vars */
// modules/drivers/services/driver.service.ts

import { driverRepository, DriverRepository } from '../repositories/driver.repository';
import { driverCreateSchema, driverUpdateSchema } from '@/shared/validations/driver.schema';
import { validateWithZod } from '@/shared/utils/validation.utils';
import { ValidationError, NotFoundError } from '@/server/errors/app.errors';
import { Driver, DriverFilters } from '@/shared/types/driver.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { DriverCreatedEvent } from '../events/DriverCreatedEvent';
import { DriverUpdatedEvent } from '../events/DriverUpdatedEvent';
import { DriverDeletedEvent } from '../events/DriverDeletedEvent';

type DriverCreatePayload = Omit<
  Driver,
  '_id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'isDeleted' | 'deletedAt'
>;

export class DriverService {
  constructor(private readonly repo: DriverRepository) {}

  async list(
    filters: DriverFilters,
    pagination: PaginationParams,
    tenantId: string
  ): Promise<PaginatedResponse<Driver>> {
    return this.repo.getFilteredDrivers(filters, tenantId, pagination);
  }

  async getById(id: string, tenantId: string): Promise<Driver> {
    const driver = await this.repo.findById(id, tenantId);
    if (!driver) throw new NotFoundError('Driver not found');
    return driver;
  }

  async create(rawData: unknown, tenantId: string, userId?: string): Promise<Driver> {
    const result = await validateWithZod(driverCreateSchema, rawData);
    if (!result.success || !result.data) {
      throw new ValidationError('Validation failed', result.errors || {});
    }

    const payload: DriverCreatePayload = {
      tenantId,
      name: result.data.name,
      status: result.data.status ?? 'active',
      email: result.data.email ?? undefined,
      phone: result.data.phone ?? undefined,
      driver_code: result.data.driver_code ?? undefined,
      license_number: result.data.license_number ?? undefined,
      license_expiry: result.data.license_expiry
        ? new Date(result.data.license_expiry as string)
        : undefined,
      notes: result.data.notes ?? undefined,
    };

    const created = await this.repo.create(payload, tenantId, userId);

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new DriverCreatedEvent(created, { tenantId, userId }));

    return created;
  }

  async update(id: string, rawData: unknown, tenantId: string, userId?: string): Promise<Driver> {
    const result = await validateWithZod(driverUpdateSchema, {
      ...(rawData as Record<string, unknown>),
      _id: id,
    });
    if (!result.success || !result.data) {
      throw new ValidationError('Validation failed', result.errors || {});
    }

    const { _id, ...rest } = result.data;
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest)) {
      updateData[key] = value === null ? undefined : value;
    }
    if (updateData.license_expiry) {
      updateData.license_expiry = new Date(updateData.license_expiry as string);
    }

    const updated = await this.repo.update(
      id,
      updateData as Partial<Omit<Driver, '_id' | 'tenantId' | 'createdAt' | 'createdBy'>>,
      tenantId,
      userId
    );
    if (!updated) throw new NotFoundError('Driver not found');

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new DriverUpdatedEvent(updated, updateData, { tenantId, userId }));

    return updated;
  }

  async remove(id: string, tenantId: string, userId?: string, soft: boolean = true): Promise<void> {
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) throw new NotFoundError('Driver not found');

    if (soft) await this.repo.softDelete(id, tenantId, userId);
    else await this.repo.hardDelete(id, tenantId);

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new DriverDeletedEvent(id, existing.name, tenantId, { userId, soft }));
  }
}

export const driverService = new DriverService(driverRepository);

