//modules/expenses/queries/get-vehicle-expense-breakdown.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetVehicleExpenseBreakdownQuery extends BaseQuery {
  static readonly queryName = 'GetVehicleExpenseBreakdownQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly vehicleLimit: number = 8
  ) {
    super(GetVehicleExpenseBreakdownQuery.queryName);
  }
}