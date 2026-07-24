//modules/trips/queries/get-trip-cost-analytics.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetTripCostAnalyticsQuery extends BaseQuery {
  static readonly queryName = 'GetTripCostAnalyticsQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly limit: number = 100
  ) {
    super(GetTripCostAnalyticsQuery.queryName);
  }
}