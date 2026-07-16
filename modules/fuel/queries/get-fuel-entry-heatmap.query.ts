//modules/fuel/queries/get-fuel-entry-heatmap.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetFuelEntryHeatmapQuery extends BaseQuery {
  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetFuelEntryHeatmapQuery.name);
  }
}