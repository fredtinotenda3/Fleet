// modules/expenses/queries/handlers/get-top-expense-transactions.handler.ts
import { IQueryHandler } from '@/server/cqrs/query';
import { GetTopExpenseTransactionsQuery } from '../get-top-expense-transactions.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { TopExpenseTransactionRow } from '@/shared/types/expense.types';

export class GetTopExpenseTransactionsHandler
  implements IQueryHandler<GetTopExpenseTransactionsQuery, TopExpenseTransactionRow[]>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetTopExpenseTransactionsQuery): Promise<TopExpenseTransactionRow[]> {
    return this.expenseRepo.getTopExpenseTransactions(query.tenantId, query.dateRange, query.limit);
  }
}