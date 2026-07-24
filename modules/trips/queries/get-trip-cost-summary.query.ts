//modules/trips/queries/get-trip-cost-summary.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetTripCostSummaryQuery extends BaseQuery {
  static readonly queryName = 'GetTripCostSummaryQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetTripCostSummaryQuery.queryName);
  }
}