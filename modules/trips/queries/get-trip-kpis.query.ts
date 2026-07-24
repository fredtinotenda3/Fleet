// modules/trips/queries/get-trip-kpis.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetTripKpisQuery extends BaseQuery {
  static readonly queryName = 'GetTripKpisQuery';

  constructor(
    public readonly tenantId: string,
    public readonly dateRange?: { startDate?: Date; endDate?: Date }
  ) {
    super(GetTripKpisQuery.queryName);
  }
}
