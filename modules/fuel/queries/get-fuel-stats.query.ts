// modules/fuel/queries/get-fuel-stats.query.ts
import { BaseQuery } from '@/server/cqrs/query';
import { AnalyticsScope } from '@/shared/types/analytics-scope.types';

export class GetFuelStatsQuery extends BaseQuery {
  static readonly queryName = 'GetFuelStatsQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly scope?: AnalyticsScope
  ) {
    super(GetFuelStatsQuery.queryName);
  }
}