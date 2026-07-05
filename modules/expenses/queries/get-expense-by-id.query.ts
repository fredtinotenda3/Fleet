// modules/expenses/queries/get-expense-by-id.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetExpenseByIdQuery extends BaseQuery {
  constructor(
    public readonly expenseId: string,
    public readonly tenantId: string
  ) {
    super(GetExpenseByIdQuery.name);
  }
}