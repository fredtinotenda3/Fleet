// modules/trips/queries/get-trip-stats.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetTripStatsQuery extends BaseQuery {
  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetTripStatsQuery.name);
  }
}