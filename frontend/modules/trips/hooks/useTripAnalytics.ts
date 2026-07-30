// frontend/modules/trips/hooks/useTripAnalytics.ts
//
// PHASE 2: Enterprise Trip Analytics queries, mirroring the "enterprise
// analytics" section of frontend/modules/fuel/hooks/useFuel.ts one-for-one
// (same staleTime, same rangeKey-based query-key convention).
//
// VEHICLE-SCOPE ADDITION: every query below (except useVehicleUtilization,
// a fleet-wide ranking that doesn't make sense scoped to a single
// vehicle) now accepts an optional trailing `licensePlate` argument,
// forwarded straight through to tripsApi and included in the query key
// so fleet-wide and vehicle-scoped results never collide in the cache.

import { useQuery } from '@tanstack/react-query';
import { tripsApi } from '../services/trips.api';
import type { TripUtilizationSort } from '../types';

type DateRange = { startDate?: Date; endDate?: Date } | undefined;

function rangeKey(dateRange: DateRange): string | undefined {
  return dateRange
    ? `${dateRange.startDate?.toISOString() ?? ''}-${dateRange.endDate?.toISOString() ?? ''}`
    : undefined;
}

export const tripAnalyticsKeys = {
  all: ['trips', 'analytics'] as const,
  monthlyTrend: (months: number, licensePlate?: string) =>
    [...tripAnalyticsKeys.all, 'monthly-trend', months, licensePlate] as const,
  vehicleUtilization: (range?: string, limit?: number, sortBy?: TripUtilizationSort) =>
    [...tripAnalyticsKeys.all, 'vehicle-utilization', range, limit, sortBy] as const,
  driverUtilization: (range?: string, limit?: number, sortBy?: TripUtilizationSort, licensePlate?: string) =>
    [...tripAnalyticsKeys.all, 'driver-utilization', range, limit, sortBy, licensePlate] as const,
  distanceDistribution: (range?: string, licensePlate?: string) =>
    [...tripAnalyticsKeys.all, 'distance-distribution', range, licensePlate] as const,
  dayOfWeek: (range?: string, licensePlate?: string) =>
    [...tripAnalyticsKeys.all, 'day-of-week', range, licensePlate] as const,
};

/** Monthly Trip Trend -- trips + distance + driving hours per month. */
export function useMonthlyTripTrend(months: number = 12, licensePlate?: string) {
  return useQuery({
    queryKey: tripAnalyticsKeys.monthlyTrend(months, licensePlate),
    queryFn: () => tripsApi.getMonthlyTrend(months, licensePlate),
    staleTime: 60_000,
  });
}

/**
 * Vehicle Utilization ranking -- powers "Trips/Distance by Vehicle".
 * Intentionally fleet-only: scoping this to a single vehicle would
 * collapse the ranking to one bar, so it has no licensePlate param.
 */
export function useVehicleUtilization(
  dateRange?: DateRange,
  limit: number = 20,
  sortBy: TripUtilizationSort = 'trips'
) {
  return useQuery({
    queryKey: tripAnalyticsKeys.vehicleUtilization(rangeKey(dateRange), limit, sortBy),
    queryFn: () => tripsApi.getVehicleUtilization(dateRange, limit, sortBy),
    staleTime: 60_000,
  });
}

/**
 * Driver Utilization ranking -- powers "Trips/Distance by Driver".
 * VEHICLE-SCOPE ADDITION: optional `licensePlate` narrows this to
 * "which drivers have driven this vehicle".
 */
export function useDriverUtilization(
  dateRange?: DateRange,
  limit: number = 20,
  sortBy: TripUtilizationSort = 'trips',
  licensePlate?: string
) {
  return useQuery({
    queryKey: tripAnalyticsKeys.driverUtilization(rangeKey(dateRange), limit, sortBy, licensePlate),
    queryFn: () => tripsApi.getDriverUtilization(dateRange, limit, sortBy, licensePlate),
    staleTime: 60_000,
  });
}

/** Distance Distribution histogram. VEHICLE-SCOPE ADDITION: optional licensePlate. */
export function useTripDistanceDistribution(dateRange?: DateRange, licensePlate?: string) {
  return useQuery({
    queryKey: tripAnalyticsKeys.distanceDistribution(rangeKey(dateRange), licensePlate),
    queryFn: () => tripsApi.getDistanceDistribution(dateRange, licensePlate),
    staleTime: 60_000,
  });
}

/** Day-of-week x hour-of-day heatmap. VEHICLE-SCOPE ADDITION: optional licensePlate. */
export function useTripDayOfWeekHeatmap(dateRange?: DateRange, licensePlate?: string) {
  return useQuery({
    queryKey: tripAnalyticsKeys.dayOfWeek(rangeKey(dateRange), licensePlate),
    queryFn: () => tripsApi.getDayOfWeekHeatmap(dateRange, licensePlate),
    staleTime: 60_000,
  });
}