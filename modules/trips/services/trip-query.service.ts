// modules/trips/services/trip-query.service.ts

import { queryBus } from '@/server/cqrs/query-bus';
import { GetTripsQuery } from '../queries/get-trips.query';
import { GetTripByIdQuery } from '../queries/get-trip-by-id.query';
import { GetTripStatsQuery } from '../queries/get-trip-stats.query';
import { GetDailyDistanceQuery } from '../queries/get-daily-distance.query';
import { GetTripKpisQuery } from '../queries/get-trip-kpis.query';
import { GetTripExceptionsQuery } from '../queries/get-trip-exceptions.query';
// PHASE 2
import { GetMonthlyTripTrendQuery } from '../queries/get-monthly-trip-trend.query';
import { GetVehicleUtilizationQuery } from '../queries/get-vehicle-utilization.query';
import { GetDriverUtilizationQuery } from '../queries/get-driver-utilization.query';
import { GetTripDistanceDistributionQuery } from '../queries/get-trip-distance-distribution.query';
import { GetTripsByDayOfWeekQuery } from '../queries/get-trips-by-day-of-week.query';
// PHASE 3
import { GetTripCostAnalyticsQuery } from '../queries/get-trip-cost-analytics.query';
import { GetTripCostSummaryQuery } from '../queries/get-trip-cost-summary.query';
import {
  Trip,
  TripFilters,
  TripStats,
  TripKpis,
  TripExceptionRow,
  TripMonthlyTrendPoint,
  VehicleUtilizationRow,
  DriverUtilizationRow,
  TripDistanceDistributionBucket,
  TripHeatmapCell,
  TripCostAnalyticsRow,
  TripCostSummary,
} from '@/shared/types/trip.types';
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

  /** PHASE 1 */
  async getTripKpis(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<TripKpis> {
    return queryBus.execute<TripKpis>(new GetTripKpisQuery(tenantId, dateRange));
  }

  /** PHASE 1 */
  async getTripExceptions(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    zThreshold: number = 2.5,
    limit: number = 50
  ): Promise<TripExceptionRow[]> {
    return queryBus.execute<TripExceptionRow[]>(
      new GetTripExceptionsQuery(tenantId, dateRange, zThreshold, limit)
    );
  }

  /** PHASE 2: Monthly Trip Trend */
  async getMonthlyTripTrend(
    tenantId: string,
    months: number = 12
  ): Promise<TripMonthlyTrendPoint[]> {
    return queryBus.execute<TripMonthlyTrendPoint[]>(
      new GetMonthlyTripTrendQuery(tenantId, months)
    );
  }

  /** PHASE 2: Vehicle Utilization */
  async getVehicleUtilization(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 20,
    sortBy: 'trips' | 'distance' = 'trips'
  ): Promise<VehicleUtilizationRow[]> {
    return queryBus.execute<VehicleUtilizationRow[]>(
      new GetVehicleUtilizationQuery(tenantId, dateRange, limit, sortBy)
    );
  }

  /** PHASE 2: Driver Utilization */
  async getDriverUtilization(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 20,
    sortBy: 'trips' | 'distance' = 'trips'
  ): Promise<DriverUtilizationRow[]> {
    return queryBus.execute<DriverUtilizationRow[]>(
      new GetDriverUtilizationQuery(tenantId, dateRange, limit, sortBy)
    );
  }

  /** PHASE 2: Distance Distribution histogram */
  async getTripDistanceDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<TripDistanceDistributionBucket[]> {
    return queryBus.execute<TripDistanceDistributionBucket[]>(
      new GetTripDistanceDistributionQuery(tenantId, dateRange)
    );
  }

  /** PHASE 2: Day-of-week x hour heatmap */
  async getTripsByDayOfWeek(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<TripHeatmapCell[]> {
    return queryBus.execute<TripHeatmapCell[]>(
      new GetTripsByDayOfWeekQuery(tenantId, dateRange)
    );
  }

  /** PHASE 3: Cross-module cost analytics rows (fuel/expense joined per trip). */
  async getTripCostAnalytics(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 100
  ): Promise<TripCostAnalyticsRow[]> {
    return queryBus.execute<TripCostAnalyticsRow[]>(
      new GetTripCostAnalyticsQuery(tenantId, dateRange, limit)
    );
  }

  /** PHASE 3: Fleet-wide cost summary for KPI cards. */
  async getTripCostSummary(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<TripCostSummary> {
    return queryBus.execute<TripCostSummary>(new GetTripCostSummaryQuery(tenantId, dateRange));
  }
}

export const tripQueryService = new TripQueryService();