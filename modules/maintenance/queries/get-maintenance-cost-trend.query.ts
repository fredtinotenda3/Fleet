// modules/maintenance/queries/get-maintenance-cost-trend.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetMaintenanceCostTrendQuery extends BaseQuery {
  static readonly queryName = 'GetMaintenanceCostTrendQuery';

  constructor(
    public readonly tenantId: string,
    public readonly months: number = 12,
    /** Vehicle-Level Analytics: narrows the trend to one vehicle when set. */
    public readonly licensePlate?: string
  ) {
    super(GetMaintenanceCostTrendQuery.queryName);
  }
}
