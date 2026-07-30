// modules/trips/queries/handlers/get-monthly-trip-trend.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetMonthlyTripTrendQuery } from '../get-monthly-trip-trend.query';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { TripMonthlyTrendPoint } from '@/shared/types/trip.types';

export class GetMonthlyTripTrendHandler
  implements IQueryHandler<GetMonthlyTripTrendQuery, TripMonthlyTrendPoint[]>
{
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(query: GetMonthlyTripTrendQuery): Promise<TripMonthlyTrendPoint[]> {
    return this.tripRepo.getMonthlyTripTrend(query.tenantId, query.months, query.licensePlate);
  }
}