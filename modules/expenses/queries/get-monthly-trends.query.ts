// modules/expenses/queries/get-monthly-trends.query.ts
import { BaseQuery } from '@/server/cqrs/query';
import { AnalyticsScope } from '@/shared/types/analytics-scope.types';

export class GetMonthlyTrendsQuery extends BaseQuery {
  static readonly queryName = 'GetMonthlyTrendsQuery';

  constructor(
    public readonly tenantId: string,
    public readonly months: number = 12,
    public readonly scope?: AnalyticsScope
  ) {
    super(GetMonthlyTrendsQuery.queryName);
  }
}