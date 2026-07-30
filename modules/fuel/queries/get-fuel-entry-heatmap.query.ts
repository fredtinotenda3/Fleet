// modules/fuel/queries/get-fuel-entry-heatmap.query.ts
import { BaseQuery } from '@/server/cqrs/query';
import { AnalyticsScope } from '@/shared/types/analytics-scope.types';

export class GetFuelEntryHeatmapQuery extends BaseQuery {
  static readonly queryName = 'GetFuelEntryHeatmapQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly scope?: AnalyticsScope
  ) {
    super(GetFuelEntryHeatmapQuery.queryName);
  }
}