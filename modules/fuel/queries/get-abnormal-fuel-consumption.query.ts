// modules/fuel/queries/get-abnormal-fuel-consumption.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetAbnormalFuelConsumptionQuery extends BaseQuery {
  static readonly queryName = 'GetAbnormalFuelConsumptionQuery';

  constructor(
    public readonly tenantId: string,
    public readonly threshold: number = 2
  ) {
    super(GetAbnormalFuelConsumptionQuery.queryName);
  }
}