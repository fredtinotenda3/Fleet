// modules/trips/queries/get-trip-distance-distribution.query.ts
//
// PHASE 2: distance histogram, mirrors get-fuel-cost-distribution.query.ts.
// VEHICLE-SCOPE ADDITION: optional licensePlate narrows the histogram
// to a single vehicle's trip-distance spread.

import { BaseQuery } from '@/server/cqrs/query';

export class GetTripDistanceDistributionQuery extends BaseQuery {
  static readonly queryName = 'GetTripDistanceDistributionQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly licensePlate?: string
  ) {
    super(GetTripDistanceDistributionQuery.queryName);
  }
}