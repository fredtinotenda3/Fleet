// modules/fuel/queries/get-fuel-type-distribution.query.ts
import { BaseQuery } from '@/server/cqrs/query';
import { AnalyticsScope } from '@/shared/types/analytics-scope.types';

export class GetFuelTypeDistributionQuery extends BaseQuery {
  static readonly queryName = 'GetFuelTypeDistributionQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly scope?: AnalyticsScope
  ) {
    super(GetFuelTypeDistributionQuery.queryName);
  }
}