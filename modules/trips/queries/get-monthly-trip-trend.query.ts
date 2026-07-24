// modules/trips/queries/get-monthly-trip-trend.query.ts
//
// PHASE 2: Monthly Trip Trend, mirrors get-monthly-fuel-consumption.query.ts.

import { BaseQuery } from '@/server/cqrs/query';

export class GetMonthlyTripTrendQuery extends BaseQuery {
  static readonly queryName = 'GetMonthlyTripTrendQuery';

  constructor(
    public readonly tenantId: string,
    public readonly months: number = 12
  ) {
    super(GetMonthlyTripTrendQuery.queryName);
  }
}