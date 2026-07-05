// modules/fuel/queries/get-top-fuel-consumers.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetTopFuelConsumersQuery extends BaseQuery {
  constructor(
    public readonly tenantId: string,
    public readonly limit: number = 5
  ) {
    super(GetTopFuelConsumersQuery.name);
  }
}