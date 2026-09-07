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
import { WriteScope, tenantIdOf } from '@/server/tenancy/write-scope';
import { resolveCreationOrgUnitId } from '@/server/utils/tenant-context.utils';
import '@/shared/types/driver.tenancy-addendum';

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

  /**
   * THE "POST 201, GET EMPTY" BUG.
   *
   * DriverController.create computed an orgUnitId with
   * resolveCreationOrgUnitId and spread it into `rawData`. It was then
   * dropped TWICE before reaching the database:
   *
   *   1. `driverCreateSchema` is a plain z.object, which strips unknown
   *      keys -- orgUnitId is not one of its fields, so validation
   *      removed it.
   *   2. Even had it survived, the `payload` below is an explicit
   *      allowlist that never mentioned orgUnitId.
   *
   * Meanwhile getFilteredDriversInScope (the only list path the
   * controller calls) filters on `{ orgUnitId: { $in: accessible } }`.
   * A field that is never written cannot match that filter, so every
   * driver created by a scope-narrowed user returned 201 and was then
   * invisible to its own creator -- while an org-wide admin
   * (accessibleOrgUnitIds === null, no filter) saw all of them. That is
   * exactly the reported pair of symptoms.
   *
   * THE FIX IS THE SIGNATURE, NOT A NEW FIELD IN THE PAYLOAD. Taking a
   * WriteScope and deriving orgUnitId here means the value cannot be
   * stripped by validation (it never passes through the schema) and
   * cannot be forgotten by a future allowlist edit (it is computed in
   * the same function that builds the payload). Passing it through
   * `rawData` is what failed; this removes that route entirely.
   */
  async create(rawData: unknown, scope: WriteScope, userId?: string): Promise<Driver> {
    const tenantId = tenantIdOf(scope);
    const result = await validateWithZod(driverCreateSchema, rawData);
    if (!result.success || !result.data) {
      throw new ValidationError('Validation failed', result.errors || {});
    }

    /**
     * A driver has no vehicle to inherit a unit from, so unlike fuel /
     * expenses / trips this uses the SUBMITTER's unit -- the rule
     * resolveCreationOrgUnitId exists for. It also throws when a
     * scope-narrowed caller names a unit outside their scope, or has no
     * assignment at all (in which case there is no correct unit and the
     * record would be invisible to everyone).
     */
    const orgUnitId =
      scope.kind === 'user'
        ? resolveCreationOrgUnitId(scope.context, (rawData as Record<string, unknown>)?.orgUnitId)
        : undefined;

    const payload: DriverCreatePayload = {
      tenantId,
      ...(orgUnitId ? { orgUnitId } : {}),
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

