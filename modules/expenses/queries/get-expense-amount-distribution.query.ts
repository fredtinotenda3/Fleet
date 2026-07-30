// modules/expenses/queries/get-expense-amount-distribution.query.ts
import { BaseQuery } from '@/server/cqrs/query';
import { AnalyticsScope } from '@/shared/types/analytics-scope.types';

export class GetExpenseAmountDistributionQuery extends BaseQuery {
  static readonly queryName = 'GetExpenseAmountDistributionQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly scope?: AnalyticsScope
  ) {
    super(GetExpenseAmountDistributionQuery.queryName);
  }
}