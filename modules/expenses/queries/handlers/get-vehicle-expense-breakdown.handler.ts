//modules/expenses/queries/handlers/get-vehicle-expense-breakdown.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetVehicleExpenseBreakdownQuery } from '../get-vehicle-expense-breakdown.query';
import { ExpenseRepository } from '@/modules/expenses/repositories/expense.repository';
import { VehicleExpenseBreakdownRow } from '@/shared/types/expense.types';

export class GetVehicleExpenseBreakdownHandler
  implements IQueryHandler<GetVehicleExpenseBreakdownQuery, VehicleExpenseBreakdownRow[]>
{
  constructor(private readonly expenseRepo: ExpenseRepository) {}

  async execute(query: GetVehicleExpenseBreakdownQuery): Promise<VehicleExpenseBreakdownRow[]> {
    return this.expenseRepo.getVehicleExpenseBreakdown(query.tenantId, query.dateRange, query.vehicleLimit);
  }
}