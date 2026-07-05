// modules/expenses/queries/handlers/get-expense-analytics.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetExpenseAnalyticsQuery } from '../get-expense-analytics.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';

export class GetExpenseAnalyticsHandler
  implements IQueryHandler<GetExpenseAnalyticsQuery, unknown[]>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetExpenseAnalyticsQuery): Promise<unknown[]> {
    return this.expenseRepo.getExpenseAnalytics(
      query.tenantId,
      query.startDate,
      query.endDate
    );
  }
}