// modules/expenses/queries/handlers/get-expense-stats.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetExpenseStatsQuery } from '../get-expense-stats.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { ExpenseStats } from '@/shared/types/expense.types';

export class GetExpenseStatsHandler
  implements IQueryHandler<GetExpenseStatsQuery, ExpenseStats>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetExpenseStatsQuery): Promise<ExpenseStats> {
    return this.expenseRepo.getExpenseStats(query.tenantId, query.dateRange);
  }
}