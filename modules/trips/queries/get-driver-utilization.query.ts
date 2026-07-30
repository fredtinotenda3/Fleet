// modules/trips/queries/get-driver-utilization.query.ts
//
// PHASE 2: per-driver trips/distance/hours ranking, mirrors
// get-fuel-by-driver.query.ts.
// VEHICLE-SCOPE ADDITION: optional licensePlate narrows the ranking to
// "drivers of this vehicle" instead of the whole fleet.

import { BaseQuery } from '@/server/cqrs/query';

export class GetDriverUtilizationQuery extends BaseQuery {
  static readonly queryName = 'GetDriverUtilizationQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly limit: number = 20,
    public readonly sortBy: 'trips' | 'distance' = 'trips',
    public readonly licensePlate?: string
  ) {
    super(GetDriverUtilizationQuery.queryName);
  }
}