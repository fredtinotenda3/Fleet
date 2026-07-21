// modules/expenses/queries/get-daily-expense-totals.query.ts
import { BaseQuery } from '@/server/cqrs/query';

export class GetDailyExpenseTotalsQuery extends BaseQuery {
  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetDailyExpenseTotalsQuery.name);
  }
}