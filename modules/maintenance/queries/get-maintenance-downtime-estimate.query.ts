//modules/maintenance/queries/get-maintenance-downtime-estimate.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetMaintenanceDowntimeEstimateQuery extends BaseQuery {
  static readonly queryName = 'GetMaintenanceDowntimeEstimateQuery';

  constructor(
    public readonly tenantId: string,
    public readonly limit: number = 20
  ) {
    super(GetMaintenanceDowntimeEstimateQuery.queryName);
  }
}