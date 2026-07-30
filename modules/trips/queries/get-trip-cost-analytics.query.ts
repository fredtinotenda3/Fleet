// modules/trips/queries/get-trip-cost-analytics.query.ts
//
// VEHICLE-SCOPE ADDITION: optional licensePlate narrows the cross-module
// cost rows to a single vehicle's linked trips.

import { BaseQuery } from '@/server/cqrs/query';

export class GetTripCostAnalyticsQuery extends BaseQuery {
  static readonly queryName = 'GetTripCostAnalyticsQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly limit: number = 100,
    public readonly licensePlate?: string
  ) {
    super(GetTripCostAnalyticsQuery.queryName);
  }
}