// modules/fuel/queries/get-top-fuel-consumers.query.ts
import { BaseQuery } from '@/server/cqrs/query';
import { AnalyticsScope } from '@/shared/types/analytics-scope.types';

export class GetTopFuelConsumersQuery extends BaseQuery {
  static readonly queryName = 'GetTopFuelConsumersQuery';

  constructor(
    public readonly tenantId: string,
    public readonly limit: number = 5,
    public readonly scope?: AnalyticsScope
  ) {
    super(GetTopFuelConsumersQuery.queryName);
  }
}