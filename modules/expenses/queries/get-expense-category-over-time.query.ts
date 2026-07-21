//modules/expenses/queries/get-expense-category-over-time.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetExpenseCategoryOverTimeQuery extends BaseQuery {
  static readonly queryName = 'GetExpenseCategoryOverTimeQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetExpenseCategoryOverTimeQuery.queryName);
  }
}