//modules/maintenance/queries/get-most-expensive-vehicles.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetMostExpensiveVehiclesQuery extends BaseQuery {
  static readonly queryName = 'GetMostExpensiveVehiclesQuery';

  constructor(
    public readonly tenantId: string,
    public readonly limit: number = 20
  ) {
    super(GetMostExpensiveVehiclesQuery.queryName);
  }
}