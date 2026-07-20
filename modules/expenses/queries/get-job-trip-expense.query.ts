//modules/expenses/queries/get-job-trip-expense.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetJobTripExpenseQuery extends BaseQuery {
  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly jobLimit: number = 10
  ) {
    super(GetJobTripExpenseQuery.name);
  }
}