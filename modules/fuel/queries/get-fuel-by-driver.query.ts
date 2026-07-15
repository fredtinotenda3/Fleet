
// modules/fuel/queries/get-fuel-by-driver.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetFuelByDriverQuery extends BaseQuery {
  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly limit: number = 10
  ) {
    super(GetFuelByDriverQuery.name);
  }
}


