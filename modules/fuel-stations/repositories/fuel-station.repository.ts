// modules/fuel-stations/repositories/fuel-station.repository.ts

import { BaseRepository } from '@/server/repositories/base.repository';
import { FuelStation, FuelStationFilters } from '@/shared/types/fuel-station.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { Filter } from 'mongodb';

export class FuelStationRepository extends BaseRepository<FuelStation> {
  protected collectionName = 'tblfuelstations';

  async getFilteredStations(
    filters: FuelStationFilters,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<FuelStation>> {
    const filter: Record<string, unknown> = {};

    if (filters.search) {
      filter.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { brand: { $regex: filters.search, $options: 'i' } },
        { city: { $regex: filters.search, $options: 'i' } },
      ];
    }
    if (filters.isActive !== undefined) {
      filter.isActive = filters.isActive;
    }

    return this.findWithPagination(filter as Filter<FuelStation>, pagination, tenantId);
  }
}

export const fuelStationRepository = new FuelStationRepository();