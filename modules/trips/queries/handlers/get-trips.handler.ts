// modules/trips/queries/handlers/get-trips.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetTripsQuery } from '../get-trips.query';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { Trip } from '@/shared/types/trip.types';
import { PaginatedResponse } from '@/shared/types/common.types';

export class GetTripsHandler
  implements IQueryHandler<GetTripsQuery, PaginatedResponse<Trip>>
{
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(query: GetTripsQuery): Promise<PaginatedResponse<Trip>> {
    return this.tripRepo.getFilteredTrips(
      query.filters,
      query.tenantId,
      query.pagination
    );
  }
}