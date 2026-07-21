// modules/expenses/queries/get-expense-category-summary.query.ts
import { BaseQuery } from '@/server/cqrs/query';

export class GetExpenseCategorySummaryQuery extends BaseQuery {
  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetExpenseCategorySummaryQuery.name);
  }
}