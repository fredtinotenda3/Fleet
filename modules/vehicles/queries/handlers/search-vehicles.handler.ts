// modules/vehicles/queries/handlers/search-vehicles.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { SearchVehiclesQuery } from '../search-vehicles.query';
import { VehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { Vehicle } from '@/shared/types/vehicle.types';
import { PaginatedResponse } from '@/shared/types/common.types';

export class SearchVehiclesHandler
  implements IQueryHandler<SearchVehiclesQuery, PaginatedResponse<Vehicle>>
{
  constructor(private readonly vehicleRepo: VehicleRepository) {}

  async execute(query: SearchVehiclesQuery): Promise<PaginatedResponse<Vehicle>> {
    if (!query.searchTerm || query.searchTerm.length < 2) {
      const safeFilters = { page: query.pagination.page, limit: query.pagination.limit };
      return this.vehicleRepo.getFilteredVehicles(
        safeFilters as any,
        query.pagination,
        query.tenantId
      );
    }
    return this.vehicleRepo.searchVehicles(
      query.searchTerm,
      query.tenantId,
      query.pagination
    );
  }
}