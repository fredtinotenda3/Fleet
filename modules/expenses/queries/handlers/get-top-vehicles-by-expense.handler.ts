//modules/expenses/queries/handlers/get-top-vehicles-by-expense.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetTopVehiclesByExpenseQuery } from '../get-top-vehicles-by-expense.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { TopVehicleExpenseRow } from '@/shared/types/expense.types';

export class GetTopVehiclesByExpenseHandler
  implements IQueryHandler<GetTopVehiclesByExpenseQuery, TopVehicleExpenseRow[]>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetTopVehiclesByExpenseQuery): Promise<TopVehicleExpenseRow[]> {
    return this.expenseRepo.getTopVehiclesByExpense(query.tenantId, query.dateRange, query.limit);
  }
}