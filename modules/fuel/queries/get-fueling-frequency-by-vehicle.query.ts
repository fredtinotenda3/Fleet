// modules/fuel/queries/get-fueling-frequency-by-vehicle.query.ts
import { BaseQuery } from '@/server/cqrs/query';
import { AnalyticsScope } from '@/shared/types/analytics-scope.types';

export class GetFuelingFrequencyByVehicleQuery extends BaseQuery {
  static readonly queryName = 'GetFuelingFrequencyByVehicleQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly limit: number = 20,
    public readonly scope?: AnalyticsScope
  ) {
    super(GetFuelingFrequencyByVehicleQuery.queryName);
  }
}