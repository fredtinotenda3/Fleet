// modules/fuel/queries/get-average-fuel-price-trend.query.ts
import { BaseQuery } from '@/server/cqrs/query';
import { FuelTrendGranularity } from '@/shared/types/fuel.types';
import { AnalyticsScope } from '@/shared/types/analytics-scope.types';

export class GetAverageFuelPriceTrendQuery extends BaseQuery {
  static readonly queryName = 'GetAverageFuelPriceTrendQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly granularity: FuelTrendGranularity = 'month',
    public readonly scope?: AnalyticsScope
  ) {
    super(GetAverageFuelPriceTrendQuery.queryName);
  }
}