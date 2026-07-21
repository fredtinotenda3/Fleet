// modules/vehicles/queries/get-vehicle-analytics.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetVehicleAnalyticsQuery extends BaseQuery {
  static readonly queryName = 'GetVehicleAnalyticsQuery';

  constructor(
    public readonly tenantId: string,
    public readonly startDate: Date,
    public readonly endDate: Date
  ) {
    super(GetVehicleAnalyticsQuery.queryName);
  }
}