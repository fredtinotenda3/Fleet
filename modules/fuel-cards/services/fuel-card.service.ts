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
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import '@/shared/types/fuel-card.tenancy-addendum';
import { WriteScope, tenantIdOf } from '@/server/tenancy/write-scope';
import { vehicleWriteResolver } from '@/modules/vehicles/services/vehicle-write-resolver.service';
import { resolveCreationOrgUnitId } from '@/server/utils/tenant-context.utils';

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

  /** Org-unit-scoped variant of list(). */
  async listInScope(
    filters: FuelCardFilters,
    pagination: PaginationParams,
    context: TenantContext
  ): Promise<PaginatedResponse<FuelCard>> {
    return this.repo.getFilteredCardsInScope(filters, context, pagination);
  }

  /**
   * Scoped single-card read.
   *
   * Returns 404 rather than 403 for a card in another branch. A 403
   * confirms the card exists, which for a payment instrument is itself a
   * disclosure -- it tells an attacker their guessed id is real.
   */
  async getByIdInScope(id: string, context: TenantContext): Promise<FuelCard> {
    const card = await this.repo.findById(id, context.organizationId);
    if (!card) throw new NotFoundError('Fuel card not found');
    if (
      context.accessibleOrgUnitIds !== null &&
      (!card.orgUnitId || !context.accessibleOrgUnitIds.includes(card.orgUnitId))
    ) {
      throw new NotFoundError('Fuel card not found');
    }
    return card;
  }

  /**
   * TWO FIXES.
   *
   * 1. SCOPE. The vehicle lookup below had no tenantId filter at all,
   *    so a card could be bound to another tenant's plate.
   * 2. SCOPE MISMATCH. getById (above) refuses a card whose orgUnitId
   *    is outside the caller's scope, and treats a card with NO
   *    orgUnitId as out of scope -- but create never wrote the field.
   *    Every fuel card created by a scope-narrowed user was therefore
   *    invisible to that same user the moment they navigated away.
   *    This is the drivers/dispatch/bookings class; see
   *    server/tenancy/write-scope.ts.
   *
   * A card bound to a vehicle inherits that vehicle's unit (the card
   * belongs where the truck is). A card with no vehicle has no asset to
   * inherit from, so it falls back to the submitter's own unit via
   * resolveCreationOrgUnitId -- the rule this codebase already uses for
   * asset-less records such as drivers.
   */
  async create(rawData: unknown, scope: WriteScope, userId?: string): Promise<FuelCard> {
    const tenantId = tenantIdOf(scope);
    const result = await validateWithZod(fuelCardCreateSchema, rawData);
    if (!result.success || !result.data) {
      throw new ValidationError('Validation failed', result.errors || {});
    }

    let orgUnitId: string | undefined;
    if (result.data.license_plate) {
      const vehicle = await vehicleWriteResolver.resolveForWrite(result.data.license_plate, scope);
      orgUnitId = vehicleWriteResolver.orgUnitIdFor(vehicle);
    } else if (scope.kind === 'user') {
      orgUnitId = resolveCreationOrgUnitId(scope.context, undefined);
    }

    const payload: FuelCardCreatePayload = {
      tenantId,
      ...(orgUnitId ? { orgUnitId } : {}),
      card_last4: result.data.card_last4,
      provider: result.data.provider,
      currency: result.data.currency ?? 'USD',
      license_plate: result.data.license_plate ? result.data.license_plate.toUpperCase() : undefined,
      status: result.data.status ?? 'active',
      monthly_limit: result.data.monthly_limit ?? undefined,
      notes: result.data.notes ?? undefined,
      expiry_date: result.data.expiry_date ? new Date(result.data.expiry_date as string) : undefined,
    };

    const created = await this.repo.create(payload, tenantId, userId);

    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new FuelCardCreatedEvent(created, { tenantId, userId }));

    return created;
  }

  async update(id: string, rawData: unknown, scope: WriteScope, userId?: string): Promise<FuelCard> {
    const tenantId = tenantIdOf(scope);
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
      // Re-binding a card to a different vehicle moves it between
      // branches, exactly as re-plating a fuel log does.
      const vehicle = await vehicleWriteResolver.resolveForWrite(
        String(updateData.license_plate),
        scope
      );
      updateData.license_plate = String(updateData.license_plate).toUpperCase();
      updateData.orgUnitId = vehicleWriteResolver.orgUnitIdFor(vehicle) ?? null;
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