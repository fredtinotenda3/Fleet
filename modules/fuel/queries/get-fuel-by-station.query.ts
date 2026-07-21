//modules/fuel/queries/get-fuel-by-station.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetFuelByStationQuery extends BaseQuery {
  static readonly queryName = 'GetFuelByStationQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly limit: number = 15
  ) {
    super(GetFuelByStationQuery.queryName);
  }
}