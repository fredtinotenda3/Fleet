// modules/trips/queries/handlers/get-daily-distance.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetDailyDistanceQuery } from '../get-daily-distance.query';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';

export class GetDailyDistanceHandler
  implements IQueryHandler<GetDailyDistanceQuery, Array<{ date: string; distance: number }>>
{
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(
    query: GetDailyDistanceQuery
  ): Promise<Array<{ date: string; distance: number }>> {
    return this.tripRepo.getDailyDistance(query.tenantId, query.days);
  }
}