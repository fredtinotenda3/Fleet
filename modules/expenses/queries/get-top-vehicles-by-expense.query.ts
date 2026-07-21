//modules/expenses/queries/get-top-vehicles-by-expense.query.ts
import { BaseQuery } from '@/server/cqrs/query';

export class GetTopVehiclesByExpenseQuery extends BaseQuery {
  static readonly queryName = 'GetTopVehiclesByExpenseQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly limit: number = 10
  ) {
    super(GetTopVehiclesByExpenseQuery.queryName);
  }
}