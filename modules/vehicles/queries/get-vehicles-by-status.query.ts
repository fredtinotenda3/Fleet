// modules/vehicles/queries/get-vehicles-by-status.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetVehiclesByStatusQuery extends BaseQuery {
  static readonly queryName = 'GetVehiclesByStatusQuery';

  constructor(
    public readonly status: string,
    public readonly tenantId: string
  ) {
    super(GetVehiclesByStatusQuery.queryName);
  }
}