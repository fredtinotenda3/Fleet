// modules/expenses/queries/get-expense-stats.query.ts

import { BaseQuery } from '@/server/cqrs/query';
import { DateRange } from '@/shared/types/common.types';

export class GetExpenseStatsQuery extends BaseQuery {
  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: DateRange
  ) {
    super(GetExpenseStatsQuery.name);
  }
}