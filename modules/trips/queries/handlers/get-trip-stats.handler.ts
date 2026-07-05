// modules/trips/queries/handlers/get-trip-stats.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetTripStatsQuery } from '../get-trip-stats.query';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { TripStats } from '@/shared/types/trip.types';

export class GetTripStatsHandler implements IQueryHandler<GetTripStatsQuery, TripStats> {
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(query: GetTripStatsQuery): Promise<TripStats> {
    return this.tripRepo.getTripStats(query.tenantId, query.dateRange);
  }
}