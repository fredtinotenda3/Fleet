// modules/fuel/queries/get-fuel-kpis.query.ts

import { BaseQuery } from '@/server/cqrs/query';
import { AnalyticsScope } from '@/shared/types/analytics-scope.types';

export class GetFuelKpisQuery extends BaseQuery {
  static readonly queryName = 'GetFuelKpisQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly tripDistanceByVehicle?: Record<string, number>,
    public readonly prevTripDistanceByVehicle?: Record<string, number>,
    public readonly scope?: AnalyticsScope
  ) {
    super(GetFuelKpisQuery.queryName);
  }
}