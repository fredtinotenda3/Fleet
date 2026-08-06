// modules/trips/services/trip-query.service.ts

import { queryBus } from '@/server/cqrs/query-bus';
import { GetTripsQuery } from '../queries/get-trips.query';
import { GetTripByIdQuery } from '../queries/get-trip-by-id.query';
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
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tripRepository } from '../repositories/trip.repository';

// FIX (Phase B -- repository/analytics scoping completeness): same
// change as FuelQueryService/ExpenseQueryService -- the 12 analytics
// methods below used to route through queryBus -> Query class -> Handler,
// none of which carried `context`. These now call the (already
// org-unit-scoped) repository directly. CRUD/list methods
// (getFilteredTrips, getTripById) are unchanged and still routed through
// the CQRS bus.
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
    dateRange?: { startDate?: Date; endDate?: Date },
    context?: TenantContext
  ): Promise<TripStats> {
    return tripRepository.getTripStats(tenantId, dateRange, context);
  }

  async getDailyDistance(
    tenantId: string,
    days: number = 30,
    context?: TenantContext
  ): Promise<Array<{ date: string; distance: number }>> {
    return tripRepository.getDailyDistance(tenantId, days, context);
  }

  /** PHASE 1. VEHICLE-SCOPE ADDITION: optional licensePlate. */
  async getTripKpis(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    licensePlate?: string,
    context?: TenantContext
  ): Promise<TripKpis> {
    return tripRepository.getTripKpis(tenantId, dateRange, licensePlate, context);
  }

  /** PHASE 1. VEHICLE-SCOPE ADDITION: optional licensePlate. */
  async getTripExceptions(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    zThreshold: number = 2.5,
    limit: number = 50,
    licensePlate?: string,
    context?: TenantContext
  ): Promise<TripExceptionRow[]> {
    return tripRepository.getTripExceptions(tenantId, dateRange, zThreshold, limit, licensePlate, context);
  }

  /** PHASE 2: Monthly Trip Trend. VEHICLE-SCOPE ADDITION: optional licensePlate. */
  async getMonthlyTripTrend(
    tenantId: string,
    months: number = 12,
    licensePlate?: string,
    context?: TenantContext
  ): Promise<TripMonthlyTrendPoint[]> {
    return tripRepository.getMonthlyTripTrend(tenantId, months, licensePlate, context);
  }

  /** PHASE 2: Vehicle Utilization (fleet-wide ranking; not vehicle-scoped
   *  by design -- scoping this to one vehicle collapses it to a single
   *  bar, so it is intentionally left fleet-only). */
  async getVehicleUtilization(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 20,
    sortBy: 'trips' | 'distance' = 'trips',
    context?: TenantContext
  ): Promise<VehicleUtilizationRow[]> {
    return tripRepository.getVehicleUtilization(tenantId, dateRange, limit, sortBy, context);
  }

  /** PHASE 2: Driver Utilization. VEHICLE-SCOPE ADDITION: optional licensePlate. */
  async getDriverUtilization(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 20,
    sortBy: 'trips' | 'distance' = 'trips',
    licensePlate?: string,
    context?: TenantContext
  ): Promise<DriverUtilizationRow[]> {
    return tripRepository.getDriverUtilization(tenantId, dateRange, limit, sortBy, licensePlate, context);
  }

  /** PHASE 2: Distance Distribution histogram. VEHICLE-SCOPE ADDITION: optional licensePlate. */
  async getTripDistanceDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    licensePlate?: string,
    context?: TenantContext
  ): Promise<TripDistanceDistributionBucket[]> {
    return tripRepository.getTripDistanceDistribution(tenantId, dateRange, licensePlate, context);
  }

  /** PHASE 2: Day-of-week x hour heatmap. VEHICLE-SCOPE ADDITION: optional licensePlate. */
  async getTripsByDayOfWeek(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    licensePlate?: string,
    context?: TenantContext
  ): Promise<TripHeatmapCell[]> {
    return tripRepository.getTripsByDayOfWeek(tenantId, dateRange, licensePlate, context);
  }

  /** PHASE 3: Cross-module cost analytics rows. VEHICLE-SCOPE ADDITION: optional licensePlate. */
  async getTripCostAnalytics(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 100,
    licensePlate?: string,
    context?: TenantContext
  ): Promise<TripCostAnalyticsRow[]> {
    return tripRepository.getTripCostAnalytics(tenantId, dateRange, limit, licensePlate, context);
  }

  /** PHASE 3: Fleet/vehicle cost summary for KPI cards. VEHICLE-SCOPE ADDITION: optional licensePlate. */
  async getTripCostSummary(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    licensePlate?: string,
    context?: TenantContext
  ): Promise<TripCostSummary> {
    return tripRepository.getTripCostSummary(tenantId, dateRange, licensePlate, context);
  }
}

export const tripQueryService = new TripQueryService();