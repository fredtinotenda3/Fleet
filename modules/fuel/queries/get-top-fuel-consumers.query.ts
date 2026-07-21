// modules/fuel/queries/get-top-fuel-consumers.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetTopFuelConsumersQuery extends BaseQuery {
  static readonly queryName = 'GetTopFuelConsumersQuery';

  constructor(
    public readonly tenantId: string,
    public readonly limit: number = 5
  ) {
    super(GetTopFuelConsumersQuery.queryName);
  }
}