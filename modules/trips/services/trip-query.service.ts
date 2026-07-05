// modules/trips/services/trip-query.service.ts

import { queryBus } from '@/server/cqrs/query-bus';
import { GetTripsQuery } from '../queries/get-trips.query';
import { GetTripByIdQuery } from '../queries/get-trip-by-id.query';
import { GetTripStatsQuery } from '../queries/get-trip-stats.query';
import { GetDailyDistanceQuery } from '../queries/get-daily-distance.query';
import { Trip, TripFilters, TripStats } from '@/shared/types/trip.types';
import { PaginatedResponse, PaginationParams } from '@/shared/types/common.types';

export class TripQueryService {
  async getFilteredTrips(
    filters: TripFilters,
    pagination: PaginationParams,
    tenantId: string
  ): Promise<PaginatedResponse<Trip>> {
    return queryBus.execute<PaginatedResponse<Trip>>(
      new GetTripsQuery(filters, pagination, tenantId)
    );
  }

  async getTripById(tripId: string, tenantId: string): Promise<Trip> {
    return queryBus.execute<Trip>(new GetTripByIdQuery(tripId, tenantId));
  }

  async getTripStats(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<TripStats> {
    return queryBus.execute<TripStats>(new GetTripStatsQuery(tenantId, dateRange));
  }

  async getDailyDistance(
    tenantId: string,
    days: number = 30
  ): Promise<Array<{ date: string; distance: number }>> {
    return queryBus.execute<Array<{ date: string; distance: number }>>(
      new GetDailyDistanceQuery(tenantId, days)
    );
  }
}

export const tripQueryService = new TripQueryService();