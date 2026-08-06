import { prefixMatch, containsMatch } from '@/shared/utils/regex.utils';
// modules/fuel-cards/repositories/fuel-card.repository.ts

import { TenantScopedRepository } from '@/server/repositories/tenant-scoped.repository';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { FuelCard, FuelCardFilters } from '@/shared/types/fuel-card.types';
import '@/shared/types/fuel-card.tenancy-addendum';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { Filter } from 'mongodb';

/** SCOPED (Phase F) -- a card is a payment instrument issued against one vehicle. */
export class FuelCardRepository extends TenantScopedRepository<FuelCard> {
  protected collectionName = 'tblfuelcards';

  async getFilteredCards(
    filters: FuelCardFilters,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<FuelCard>> {
    const filter: Record<string, unknown> = {};

    if (filters.search) {
      filter.$or = [
        { provider: containsMatch(filters.search) },
        { card_last4: containsMatch(filters.search) },
        { license_plate: containsMatch(filters.search) },
      ];
    }
    if (filters.status) {
      filter.status = filters.status;
    }

    return this.findWithPagination(filter as Filter<FuelCard>, pagination, tenantId);
  }

  /** Org-unit-scoped variant of getFilteredCards. */
  async getFilteredCardsInScope(
    filters: FuelCardFilters,
    context: TenantContext,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<FuelCard>> {
    const filter: Record<string, unknown> = {};

    if (filters.search) {
      filter.$or = [
        { provider: containsMatch(filters.search) },
        { card_last4: containsMatch(filters.search) },
        { license_plate: containsMatch(filters.search) },
      ];
    }
    if (filters.status) {
      filter.status = filters.status;
    }

    return this.findWithPaginationInScope(filter as Filter<FuelCard>, pagination, context);
  }
}

export const fuelCardRepository = new FuelCardRepository();