// modules/expenses/queries/get-job-trip-expense.query.ts
import { BaseQuery } from '@/server/cqrs/query';
import { AnalyticsScope } from '@/shared/types/analytics-scope.types';

export class GetJobTripExpenseQuery extends BaseQuery {
  static readonly queryName = 'GetJobTripExpenseQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly jobLimit: number = 10,
    public readonly scope?: AnalyticsScope
  ) {
    super(GetJobTripExpenseQuery.queryName);
  }
}