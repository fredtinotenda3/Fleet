//modules/fuel/queries/get-fueling-frequency-by-vehicle.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetFuelingFrequencyByVehicleQuery extends BaseQuery {
  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly limit: number = 20
  ) {
    super(GetFuelingFrequencyByVehicleQuery.name);
  }
}