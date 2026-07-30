// modules/expenses/queries/get-expense-outliers.query.ts
import { BaseQuery } from '@/server/cqrs/query';
import { AnalyticsScope } from '@/shared/types/analytics-scope.types';

export class GetExpenseOutliersQuery extends BaseQuery {
  static readonly queryName = 'GetExpenseOutliersQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly zThreshold: number = 2.5,
    public readonly limit: number = 25,
    public readonly scope?: AnalyticsScope
  ) {
    super(GetExpenseOutliersQuery.queryName);
  }
}