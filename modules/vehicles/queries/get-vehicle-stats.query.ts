// modules/vehicles/queries/get-vehicle-stats.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetVehicleStatsQuery extends BaseQuery {
  static readonly queryName = 'GetVehicleStatsQuery';

  constructor(public readonly tenantId: string) {
    super(GetVehicleStatsQuery.queryName);
  }
}