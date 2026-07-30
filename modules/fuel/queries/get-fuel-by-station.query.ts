// modules/fuel/queries/get-fuel-by-station.query.ts
import { BaseQuery } from '@/server/cqrs/query';
import { AnalyticsScope } from '@/shared/types/analytics-scope.types';

export class GetFuelByStationQuery extends BaseQuery {
  static readonly queryName = 'GetFuelByStationQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly limit: number = 15,
    public readonly scope?: AnalyticsScope
  ) {
    super(GetFuelByStationQuery.queryName);
  }
}