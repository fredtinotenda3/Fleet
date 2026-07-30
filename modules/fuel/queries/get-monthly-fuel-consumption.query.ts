// modules/fuel/queries/get-monthly-fuel-consumption.query.ts
import { BaseQuery } from '@/server/cqrs/query';
import { AnalyticsScope } from '@/shared/types/analytics-scope.types';

export class GetMonthlyFuelConsumptionQuery extends BaseQuery {
  static readonly queryName = 'GetMonthlyFuelConsumptionQuery';

  constructor(
    public readonly tenantId: string,
    public readonly months: number = 12,
    public readonly scope?: AnalyticsScope
  ) {
    super(GetMonthlyFuelConsumptionQuery.queryName);
  }
}