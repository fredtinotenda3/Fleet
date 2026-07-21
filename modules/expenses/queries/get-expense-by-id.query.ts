// modules/expenses/queries/get-expense-by-id.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetExpenseByIdQuery extends BaseQuery {
  static readonly queryName = 'GetExpenseByIdQuery';

  constructor(
    public readonly expenseId: string,
    public readonly tenantId: string
  ) {
    super(GetExpenseByIdQuery.queryName);
  }
}