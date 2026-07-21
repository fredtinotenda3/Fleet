// modules/expenses/queries/handlers/get-expense-category-summary.handler.ts
import { IQueryHandler } from '@/server/cqrs/query';
import { GetExpenseCategorySummaryQuery } from '../get-expense-category-summary.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { CategorySummary } from '@/shared/types/expense.types';

export class GetExpenseCategorySummaryHandler
  implements IQueryHandler<GetExpenseCategorySummaryQuery, CategorySummary[]>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetExpenseCategorySummaryQuery): Promise<CategorySummary[]> {
    return this.expenseRepo.getExpenseCategorySummary(query.tenantId, query.dateRange);
  }
}