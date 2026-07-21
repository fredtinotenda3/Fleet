// modules/expenses/queries/handlers/get-daily-expense-totals.handler.ts
import { IQueryHandler } from '@/server/cqrs/query';
import { GetDailyExpenseTotalsQuery } from '../get-daily-expense-totals.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { DailyExpenseTotal } from '@/shared/types/expense.types';

export class GetDailyExpenseTotalsHandler
  implements IQueryHandler<GetDailyExpenseTotalsQuery, DailyExpenseTotal[]>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetDailyExpenseTotalsQuery): Promise<DailyExpenseTotal[]> {
    return this.expenseRepo.getDailyExpenseTotals(query.tenantId, query.dateRange);
  }
}