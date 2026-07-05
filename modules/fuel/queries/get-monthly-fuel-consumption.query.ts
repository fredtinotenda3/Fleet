// modules/fuel/queries/get-monthly-fuel-consumption.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetMonthlyFuelConsumptionQuery extends BaseQuery {
  constructor(
    public readonly tenantId: string,
    public readonly months: number = 12
  ) {
    super(GetMonthlyFuelConsumptionQuery.name);
  }
}