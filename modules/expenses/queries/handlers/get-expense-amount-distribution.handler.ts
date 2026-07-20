//modules/expenses/queries/handlers/get-expense-amount-distribution.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetExpenseAmountDistributionQuery } from '../get-expense-amount-distribution.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { ExpenseAmountDistributionBucket } from '@/shared/types/expense.types';

export class GetExpenseAmountDistributionHandler
  implements IQueryHandler<GetExpenseAmountDistributionQuery, ExpenseAmountDistributionBucket[]>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetExpenseAmountDistributionQuery): Promise<ExpenseAmountDistributionBucket[]> {
    return this.expenseRepo.getExpenseAmountDistribution(query.tenantId, query.dateRange);
  }
}