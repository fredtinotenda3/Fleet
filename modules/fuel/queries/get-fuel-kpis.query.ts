// modules/fuel/queries/get-fuel-kpis.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetFuelKpisQuery extends BaseQuery {
  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetFuelKpisQuery.name);
  }
}