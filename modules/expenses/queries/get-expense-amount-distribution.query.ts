//modules/expenses/queries/get-expense-amount-distribution.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetExpenseAmountDistributionQuery extends BaseQuery {
  static readonly queryName = 'GetExpenseAmountDistributionQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetExpenseAmountDistributionQuery.queryName);
  }
}