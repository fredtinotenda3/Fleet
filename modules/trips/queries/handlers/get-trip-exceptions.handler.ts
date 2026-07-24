// modules/trips/queries/handlers/get-trip-exceptions.handler.ts

import { IQueryHandler } from '@/server/cqrs/query';
import { GetTripExceptionsQuery } from '../get-trip-exceptions.query';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { TripExceptionRow } from '@/shared/types/trip.types';

export class GetTripExceptionsHandler
  implements IQueryHandler<GetTripExceptionsQuery, TripExceptionRow[]>
{
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(query: GetTripExceptionsQuery): Promise<TripExceptionRow[]> {
    return this.tripRepo.getTripExceptions(query.tenantId, query.dateRange, query.zThreshold, query.limit);
  }
}