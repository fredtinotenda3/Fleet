//modules/fuel/queries/get-fuel-activity-trend.query.ts

import { BaseQuery } from '@/server/cqrs/query';
import { FuelTrendGranularity } from '@/shared/types/fuel.types';

export class GetFuelActivityTrendQuery extends BaseQuery {
  static readonly queryName = 'GetFuelActivityTrendQuery';

  constructor(
    public readonly tenantId: string,
    public readonly granularity: FuelTrendGranularity,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetFuelActivityTrendQuery.queryName);
  }
}