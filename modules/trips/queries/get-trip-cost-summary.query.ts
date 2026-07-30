// modules/trips/queries/get-trip-cost-summary.query.ts
//
// VEHICLE-SCOPE ADDITION: optional licensePlate narrows the fleet-wide
// cost summary to a single vehicle's operating cost.

import { BaseQuery } from '@/server/cqrs/query';

export class GetTripCostSummaryQuery extends BaseQuery {
  static readonly queryName = 'GetTripCostSummaryQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly licensePlate?: string
  ) {
    super(GetTripCostSummaryQuery.queryName);
  }
}