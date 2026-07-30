// modules/trips/queries/handlers/get-trip-cost-analytics.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetTripCostAnalyticsQuery } from '../get-trip-cost-analytics.query';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { TripCostAnalyticsRow } from '@/shared/types/trip.types';

export class GetTripCostAnalyticsHandler
  implements IQueryHandler<GetTripCostAnalyticsQuery, TripCostAnalyticsRow[]>
{
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(query: GetTripCostAnalyticsQuery): Promise<TripCostAnalyticsRow[]> {
    return this.tripRepo.getTripCostAnalytics(
      query.tenantId,
      query.dateRange,
      query.limit,
      query.licensePlate
    );
  }
}