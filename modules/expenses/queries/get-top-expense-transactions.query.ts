// modules/expenses/queries/get-top-expense-transactions.query.ts
import { BaseQuery } from '@/server/cqrs/query';
import { AnalyticsScope } from '@/shared/types/analytics-scope.types';

export class GetTopExpenseTransactionsQuery extends BaseQuery {
  static readonly queryName = 'GetTopExpenseTransactionsQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly limit: number = 10,
    public readonly scope?: AnalyticsScope
  ) {
    super(GetTopExpenseTransactionsQuery.queryName);
  }
}