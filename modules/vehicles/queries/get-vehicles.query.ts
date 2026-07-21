// modules/vehicles/queries/get-vehicles.query.ts

import { BaseQuery } from '@/server/cqrs/query';
import { VehicleFilters } from '@/shared/types/vehicle.types';
import { PaginationParams } from '@/shared/types/common.types';

export class GetVehiclesQuery extends BaseQuery {
  static readonly queryName = 'GetVehiclesQuery';

  constructor(
    public readonly filters: VehicleFilters,
    public readonly pagination: PaginationParams,
    public readonly tenantId: string
  ) {
    super(GetVehiclesQuery.queryName);
  }
}