// modules/trips/queries/get-trips.query.ts

import { BaseQuery } from '@/server/cqrs/query';
import { TripFilters } from '@/shared/types/trip.types';
import { PaginationParams } from '@/shared/types/common.types';

export class GetTripsQuery extends BaseQuery {
  static readonly queryName = 'GetTripsQuery';

  constructor(
    public readonly filters: TripFilters,
    public readonly pagination: PaginationParams,
    public readonly tenantId: string
  ) {
    super(GetTripsQuery.queryName);
  }
}