// modules/trips/queries/get-trips-by-day-of-week.query.ts
//
// PHASE 2: day-of-week x hour heatmap, mirrors get-fuel-entry-heatmap.query.ts.
// VEHICLE-SCOPE ADDITION: optional licensePlate narrows the heatmap to
// a single vehicle's activity pattern.

import { BaseQuery } from '@/server/cqrs/query';

export class GetTripsByDayOfWeekQuery extends BaseQuery {
  static readonly queryName = 'GetTripsByDayOfWeekQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly licensePlate?: string
  ) {
    super(GetTripsByDayOfWeekQuery.queryName);
  }
}