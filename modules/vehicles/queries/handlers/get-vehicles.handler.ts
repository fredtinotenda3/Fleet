// modules/vehicles/queries/handlers/get-vehicles.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetVehiclesQuery } from '../get-vehicles.query';
import { VehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { vehicleFiltersSchema } from '@/shared/validations/vehicle.schema';
import { Vehicle } from '@/shared/types/vehicle.types';
import { PaginatedResponse } from '@/shared/types/common.types';

export class GetVehiclesHandler
  implements IQueryHandler<GetVehiclesQuery, PaginatedResponse<Vehicle>>
{
  constructor(private readonly vehicleRepo: VehicleRepository) {}

  async execute(query: GetVehiclesQuery): Promise<PaginatedResponse<Vehicle>> {
    const safeFilters = vehicleFiltersSchema.parse({
      ...query.filters,
      page: query.pagination.page,
      limit: query.pagination.limit,
    });

    return this.vehicleRepo.getFilteredVehicles(
      safeFilters,
      query.pagination,
      query.tenantId
    );
  }
}