// modules/vehicles/queries/get-vehicles-by-status.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetVehiclesByStatusQuery extends BaseQuery {
  constructor(
    public readonly status: string,
    public readonly tenantId: string
  ) {
    super(GetVehiclesByStatusQuery.name);
  }
}