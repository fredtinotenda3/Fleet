// modules/expenses/queries/get-expenses.query.ts

import { BaseQuery } from '@/server/cqrs/query';
import { ExpenseFilters } from '@/shared/types/expense.types';
import { PaginationParams } from '@/shared/types/common.types';

export class GetExpensesQuery extends BaseQuery {
  constructor(
    public readonly filters: ExpenseFilters,
    public readonly pagination: PaginationParams,
    public readonly tenantId: string
  ) {
    super(GetExpensesQuery.name);
  }
}