// modules/vehicles/queries/get-vehicle-analytics.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetVehicleAnalyticsQuery extends BaseQuery {
  constructor(
    public readonly tenantId: string,
    public readonly startDate: Date,
    public readonly endDate: Date
  ) {
    super(GetVehicleAnalyticsQuery.name);
  }
}