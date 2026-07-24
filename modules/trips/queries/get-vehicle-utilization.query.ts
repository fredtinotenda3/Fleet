// modules/trips/queries/get-vehicle-utilization.query.ts
//
// PHASE 2: per-vehicle trips/distance/hours ranking, powers "Trips by
// Vehicle", "Distance by Vehicle", "Vehicle Utilization" and the
// Most/Least Utilized Vehicle KPI drill-through.

import { BaseQuery } from '@/server/cqrs/query';

export class GetVehicleUtilizationQuery extends BaseQuery {
  static readonly queryName = 'GetVehicleUtilizationQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly limit: number = 20,
    public readonly sortBy: 'trips' | 'distance' = 'trips'
  ) {
    super(GetVehicleUtilizationQuery.queryName);
  }
}