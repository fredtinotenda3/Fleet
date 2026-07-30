// modules/expenses/queries/get-expense-category-summary.query.ts
import { BaseQuery } from '@/server/cqrs/query';
import { AnalyticsScope } from '@/shared/types/analytics-scope.types';

export class GetExpenseCategorySummaryQuery extends BaseQuery {
  static readonly queryName = 'GetExpenseCategorySummaryQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly scope?: AnalyticsScope
  ) {
    super(GetExpenseCategorySummaryQuery.queryName);
  }
}