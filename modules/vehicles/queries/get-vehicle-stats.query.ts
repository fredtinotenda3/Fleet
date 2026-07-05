// modules/vehicles/queries/get-vehicle-stats.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetVehicleStatsQuery extends BaseQuery {
  constructor(public readonly tenantId: string) {
    super(GetVehicleStatsQuery.name);
  }
}