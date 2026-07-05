// modules/expenses/queries/handlers/get-expense-by-id.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetExpenseByIdQuery } from '../get-expense-by-id.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { Expense } from '@/shared/types/expense.types';
import { NotFoundError } from '@/server/errors/app.errors';

export class GetExpenseByIdHandler
  implements IQueryHandler<GetExpenseByIdQuery, Expense>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetExpenseByIdQuery): Promise<Expense> {
    const expense = await this.expenseRepo.findById(query.expenseId, query.tenantId);
    if (!expense) {
      throw new NotFoundError('Expense not found');
    }
    return expense;
  }
}