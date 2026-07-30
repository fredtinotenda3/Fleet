// modules/expenses/queries/get-daily-expense-totals.query.ts
import { BaseQuery } from '@/server/cqrs/query';
import { AnalyticsScope } from '@/shared/types/analytics-scope.types';

export class GetDailyExpenseTotalsQuery extends BaseQuery {
  static readonly queryName = 'GetDailyExpenseTotalsQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly scope?: AnalyticsScope
  ) {
    super(GetDailyExpenseTotalsQuery.queryName);
  }
}