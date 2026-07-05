// modules/trips/queries/handlers/get-trip-by-id.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetTripByIdQuery } from '../get-trip-by-id.query';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { Trip } from '@/shared/types/trip.types';
import { NotFoundError } from '@/server/errors/app.errors';

export class GetTripByIdHandler implements IQueryHandler<GetTripByIdQuery, Trip> {
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(query: GetTripByIdQuery): Promise<Trip> {
    const trip = await this.tripRepo.findById(query.tripId, query.tenantId);
    if (!trip) {
      throw new NotFoundError('Trip not found');
    }
    return trip;
  }
}