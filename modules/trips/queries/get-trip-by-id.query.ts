// modules/trips/queries/get-trip-by-id.query.ts

import { BaseQuery } from '@/server/cqrs/query';

export class GetTripByIdQuery extends BaseQuery {
  static readonly queryName = 'GetTripByIdQuery';

  constructor(
    public readonly tripId: string,
    public readonly tenantId: string
  ) {
    super(GetTripByIdQuery.queryName);
  }
}