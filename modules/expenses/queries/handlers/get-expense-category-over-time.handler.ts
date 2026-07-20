//modules/expenses/queries/handlers/get-expense-category-over-time.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetExpenseCategoryOverTimeQuery } from '../get-expense-category-over-time.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { ExpenseCategoryOverTimePoint } from '@/shared/types/expense.types';

export class GetExpenseCategoryOverTimeHandler
  implements IQueryHandler<GetExpenseCategoryOverTimeQuery, ExpenseCategoryOverTimePoint[]>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetExpenseCategoryOverTimeQuery): Promise<ExpenseCategoryOverTimePoint[]> {
    return this.expenseRepo.getExpenseCategoryOverTime(query.tenantId, query.dateRange);
  }
}