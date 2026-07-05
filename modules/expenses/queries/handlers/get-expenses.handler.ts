// modules/expenses/queries/handlers/get-expenses.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetExpensesQuery } from '../get-expenses.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { Expense } from '@/shared/types/expense.types';
import { PaginatedResponse } from '@/shared/types/common.types';

export class GetExpensesHandler
  implements IQueryHandler<GetExpensesQuery, PaginatedResponse<Expense>>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetExpensesQuery): Promise<PaginatedResponse<Expense>> {
    return this.expenseRepo.getFilteredExpenses(
      query.filters,
      query.tenantId,
      query.pagination
    );
  }
}