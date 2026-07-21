// modules/fuel/queries/get-fuel-by-driver.query.ts
//
// FIX: added `sortBy` so this one pipeline can serve both the dashboard's
// existing "Fuel Consumption by Driver" widget (volume-ranked) and the new
// enterprise "Fuel Cost by Driver" chart (cost-ranked) without a duplicate
// query/handler pair. Defaults to 'volume' so every existing caller is
// unaffected.

import { BaseQuery } from '@/server/cqrs/query';

export type FuelByDriverSort = 'volume' | 'cost';

export class GetFuelByDriverQuery extends BaseQuery {
  static readonly queryName = 'GetFuelByDriverQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date },
    public readonly limit: number = 10,
    public readonly sortBy: FuelByDriverSort = 'volume'
  ) {
    super(GetFuelByDriverQuery.queryName);
  }
}