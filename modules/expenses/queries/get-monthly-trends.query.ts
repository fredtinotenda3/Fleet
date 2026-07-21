// modules/expenses/queries/get-monthly-trends.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetMonthlyTrendsQuery extends BaseQuery {
  static readonly queryName = 'GetMonthlyTrendsQuery';

  constructor(
    public readonly tenantId: string,
    public readonly months: number = 12
  ) {
    super(GetMonthlyTrendsQuery.queryName);
  }
}