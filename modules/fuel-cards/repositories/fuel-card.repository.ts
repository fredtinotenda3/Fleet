// modules/fuel-cards/repositories/fuel-card.repository.ts

import { BaseRepository } from '@/server/repositories/base.repository';
import { FuelCard, FuelCardFilters } from '@/shared/types/fuel-card.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { Filter } from 'mongodb';

export class FuelCardRepository extends BaseRepository<FuelCard> {
  protected collectionName = 'tblfuelcards';

  async getFilteredCards(
    filters: FuelCardFilters,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<FuelCard>> {
    const filter: Record<string, unknown> = {};

    if (filters.search) {
      filter.$or = [
        { provider: { $regex: filters.search, $options: 'i' } },
        { card_last4: { $regex: filters.search, $options: 'i' } },
        { license_plate: { $regex: filters.search, $options: 'i' } },
      ];
    }
    if (filters.status) {
      filter.status = filters.status;
    }

    return this.findWithPagination(filter as Filter<FuelCard>, pagination, tenantId);
  }
}

export const fuelCardRepository = new FuelCardRepository();