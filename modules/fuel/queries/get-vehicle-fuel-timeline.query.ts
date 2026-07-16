//FILE: modules/fuel/queries/get-vehicle-fuel-timeline.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export interface VehicleFuelTimelineFilters {
  license_plate?: string;
  startDate?: Date;
  endDate?: Date;
}

export class GetVehicleFuelTimelineQuery extends BaseQuery {
  constructor(
    public readonly tenantId: string,
    public readonly filters: VehicleFuelTimelineFilters
  ) {
    super(GetVehicleFuelTimelineQuery.name);
  }
}