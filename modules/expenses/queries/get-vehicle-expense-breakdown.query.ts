//modules/expenses/queries/get-vehicle-expense-breakdown.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetVehicleExpenseBreakdownQuery extends BaseQuery {
  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly vehicleLimit: number = 8
  ) {
    super(GetVehicleExpenseBreakdownQuery.name);
  }
}