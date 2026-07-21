// modules/expenses/queries/handlers/get-expense-outliers.handler.ts
import { IQueryHandler } from '@/server/cqrs/query';
import { GetExpenseOutliersQuery } from '../get-expense-outliers.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { ExpenseOutlierRow } from '@/shared/types/expense.types';

export class GetExpenseOutliersHandler
  implements IQueryHandler<GetExpenseOutliersQuery, ExpenseOutlierRow[]>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetExpenseOutliersQuery): Promise<ExpenseOutlierRow[]> {
    return this.expenseRepo.getExpenseOutliers(query.tenantId, query.dateRange, query.zThreshold, query.limit);
  }
}