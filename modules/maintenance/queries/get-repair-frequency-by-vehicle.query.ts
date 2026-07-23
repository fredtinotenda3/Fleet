//modules/maintenance/queries/get-repair-frequency-by-vehicle.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetRepairFrequencyByVehicleQuery extends BaseQuery {
  static readonly queryName = 'GetRepairFrequencyByVehicleQuery';

  constructor(
    public readonly tenantId: string,
    public readonly limit: number = 20
  ) {
    super(GetRepairFrequencyByVehicleQuery.queryName);
  }
}