// modules/trips/queries/handlers/get-trip-distance-distribution.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetTripDistanceDistributionQuery } from '../get-trip-distance-distribution.query';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { TripDistanceDistributionBucket } from '@/shared/types/trip.types';

export class GetTripDistanceDistributionHandler
  implements IQueryHandler<GetTripDistanceDistributionQuery, TripDistanceDistributionBucket[]>
{
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(
    query: GetTripDistanceDistributionQuery
  ): Promise<TripDistanceDistributionBucket[]> {
    return this.tripRepo.getTripDistanceDistribution(query.tenantId, query.dateRange, query.licensePlate);
  }
}