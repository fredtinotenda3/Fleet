// modules/expenses/queries/get-expense-analytics.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetExpenseAnalyticsQuery extends BaseQuery {
  constructor(
    public readonly tenantId: string,
    public readonly startDate: Date,
    public readonly endDate: Date
  ) {
    super(GetExpenseAnalyticsQuery.name);
  }
}