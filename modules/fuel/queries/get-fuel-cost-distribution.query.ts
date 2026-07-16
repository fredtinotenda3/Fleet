//modules/fuel/queries/get-fuel-cost-distribution.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetFuelCostDistributionQuery extends BaseQuery {
  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetFuelCostDistributionQuery.name);
  }
}