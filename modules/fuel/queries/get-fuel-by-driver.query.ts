// modules/fuel/queries/get-fuel-by-driver.query.ts
import { BaseQuery } from '@/server/cqrs/query';
import { AnalyticsScope } from '@/shared/types/analytics-scope.types';

export type FuelByDriverSort = 'volume' | 'cost';

export class GetFuelByDriverQuery extends BaseQuery {
  static readonly queryName = 'GetFuelByDriverQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly limit: number = 10,
    public readonly sortBy: FuelByDriverSort = 'volume',
    public readonly scope?: AnalyticsScope
  ) {
    super(GetFuelByDriverQuery.queryName);
  }
}