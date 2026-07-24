// modules/trips/queries/get-trips-by-day-of-week.query.ts
//
// PHASE 2: day-of-week x hour heatmap, mirrors get-fuel-entry-heatmap.query.ts.

import { BaseQuery } from '@/server/cqrs/query';

export class GetTripsByDayOfWeekQuery extends BaseQuery {
  static readonly queryName = 'GetTripsByDayOfWeekQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetTripsByDayOfWeekQuery.queryName);
  }
}