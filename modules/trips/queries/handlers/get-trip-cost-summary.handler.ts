//modules/trips/queries/handlers/get-trip-cost-summary.handler.ts
import { IQueryHandler } from '@/server/cqrs/query';
import { GetTripCostSummaryQuery } from '../get-trip-cost-summary.query';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { TripCostSummary } from '@/shared/types/trip.types';

export class GetTripCostSummaryHandler
  implements IQueryHandler<GetTripCostSummaryQuery, TripCostSummary>
{
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(query: GetTripCostSummaryQuery): Promise<TripCostSummary> {
    return this.tripRepo.getTripCostSummary(query.tenantId, query.dateRange);
  }
}