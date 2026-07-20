//modules/expenses/queries/get-expense-category-over-time.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetExpenseCategoryOverTimeQuery extends BaseQuery {
  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetExpenseCategoryOverTimeQuery.name);
  }
}