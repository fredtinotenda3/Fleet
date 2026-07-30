// modules/trips/queries/get-trip-kpis.query.ts

import { BaseQuery } from '@/server/cqrs/query';

/** VEHICLE-SCOPE ADDITION: optional licensePlate narrows the KPI set
 *  from fleet-wide to a single vehicle. */
export class GetTripKpisQuery extends BaseQuery {
  static readonly queryName = 'GetTripKpisQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly licensePlate?: string
  ) {
    super(GetTripKpisQuery.queryName);
  }
}