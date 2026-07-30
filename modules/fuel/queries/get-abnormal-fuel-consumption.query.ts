// modules/fuel/queries/get-abnormal-fuel-consumption.query.ts
import { BaseQuery } from '@/server/cqrs/query';
import { AnalyticsScope } from '@/shared/types/analytics-scope.types';

export class GetAbnormalFuelConsumptionQuery extends BaseQuery {
  static readonly queryName = 'GetAbnormalFuelConsumptionQuery';

  constructor(
    public readonly tenantId: string,
    public readonly threshold: number = 2,
    public readonly scope?: AnalyticsScope
  ) {
    super(GetAbnormalFuelConsumptionQuery.queryName);
  }
}