// modules/trips/queries/handlers/get-trips-by-day-of-week.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetTripsByDayOfWeekQuery } from '../get-trips-by-day-of-week.query';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { TripHeatmapCell } from '@/shared/types/trip.types';

export class GetTripsByDayOfWeekHandler
  implements IQueryHandler<GetTripsByDayOfWeekQuery, TripHeatmapCell[]>
{
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(query: GetTripsByDayOfWeekQuery): Promise<TripHeatmapCell[]> {
    return this.tripRepo.getTripsByDayOfWeek(query.tenantId, query.dateRange);
  }
}