// modules/vehicles/queries/get-vehicle-by-id.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetVehicleByIdQuery extends BaseQuery {
  constructor(
    public readonly vehicleId: string,
    public readonly tenantId: string
  ) {
    super(GetVehicleByIdQuery.name);
  }
}