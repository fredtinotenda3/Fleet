// modules/maintenance/queries/get-vehicle-maintenance-insights.query.ts
//
// Vehicle-Level Analytics: query for the single-vehicle-only derived
// maintenance insights (days since last service, average service
// interval, next upcoming reminder, breakdown frequency). Unlike
// GetMaintenanceStatsQuery/GetMaintenanceCostTrendQuery, licensePlate is
// required here -- there is no fleet-wide equivalent of this query.

import { BaseQuery } from '@/server/cqrs/query';

export class GetVehicleMaintenanceInsightsQuery extends BaseQuery {
  static readonly queryName = 'GetVehicleMaintenanceInsightsQuery';

  constructor(
    public readonly tenantId: string,
    public readonly licensePlate: string
  ) {
    super(GetVehicleMaintenanceInsightsQuery.queryName);
  }
}