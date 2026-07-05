// modules/fuel/queries/get-fuel-log-by-id.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetFuelLogByIdQuery extends BaseQuery {
  constructor(
    public readonly fuelLogId: string,
    public readonly tenantId: string
  ) {
    super(GetFuelLogByIdQuery.name);
  }
}