// modules/expenses/queries/handlers/get-monthly-trends.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetMonthlyTrendsQuery } from '../get-monthly-trends.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';

export class GetMonthlyTrendsHandler
  implements IQueryHandler<GetMonthlyTrendsQuery, Array<{ month: string; total: number }>>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetMonthlyTrendsQuery): Promise<Array<{ month: string; total: number }>> {
    return this.expenseRepo.getMonthlyTrends(query.tenantId, query.months);
  }
}