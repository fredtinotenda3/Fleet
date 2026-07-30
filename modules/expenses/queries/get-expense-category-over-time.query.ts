// modules/expenses/queries/get-expense-category-over-time.query.ts
import { BaseQuery } from '@/server/cqrs/query';
import { AnalyticsScope } from '@/shared/types/analytics-scope.types';

export class GetExpenseCategoryOverTimeQuery extends BaseQuery {
  static readonly queryName = 'GetExpenseCategoryOverTimeQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly scope?: AnalyticsScope
  ) {
    super(GetExpenseCategoryOverTimeQuery.queryName);
  }
}