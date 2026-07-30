// modules/trips/queries/handlers/get-trip-kpis.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetTripKpisQuery } from '../get-trip-kpis.query';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { TripKpis } from '@/shared/types/trip.types';

export class GetTripKpisHandler implements IQueryHandler<GetTripKpisQuery, TripKpis> {
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(query: GetTripKpisQuery): Promise<TripKpis> {
    return this.tripRepo.getTripKpis(query.tenantId, query.dateRange, query.licensePlate);
  }
}