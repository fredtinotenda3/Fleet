// modules/fuel/queries/get-fuel-stats.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetFuelStatsQuery extends BaseQuery {
  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetFuelStatsQuery.name);
  }
}