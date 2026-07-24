// frontend/modules/trips/hooks/useTripAnalytics.ts
//
// PHASE 2: Enterprise Trip Analytics queries, mirroring the "enterprise
// analytics" section of frontend/modules/fuel/hooks/useFuel.ts one-for-one
// (same staleTime, same rangeKey-based query-key convention).

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
  monthlyTrend: (months: number) => [...tripAnalyticsKeys.all, 'monthly-trend', months] as const,
  vehicleUtilization: (range?: string, limit?: number, sortBy?: TripUtilizationSort) =>
    [...tripAnalyticsKeys.all, 'vehicle-utilization', range, limit, sortBy] as const,
  driverUtilization: (range?: string, limit?: number, sortBy?: TripUtilizationSort) =>
    [...tripAnalyticsKeys.all, 'driver-utilization', range, limit, sortBy] as const,
  distanceDistribution: (range?: string) =>
    [...tripAnalyticsKeys.all, 'distance-distribution', range] as const,
  dayOfWeek: (range?: string) => [...tripAnalyticsKeys.all, 'day-of-week', range] as const,
};

/** Monthly Trip Trend -- trips + distance + driving hours per month. */
export function useMonthlyTripTrend(months: number = 12) {
  return useQuery({
    queryKey: tripAnalyticsKeys.monthlyTrend(months),
    queryFn: () => tripsApi.getMonthlyTrend(months),
    staleTime: 60_000,
  });
}

/** Vehicle Utilization ranking -- powers "Trips/Distance by Vehicle". */
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

/** Driver Utilization ranking -- powers "Trips/Distance by Driver". */
export function useDriverUtilization(
  dateRange?: DateRange,
  limit: number = 20,
  sortBy: TripUtilizationSort = 'trips'
) {
  return useQuery({
    queryKey: tripAnalyticsKeys.driverUtilization(rangeKey(dateRange), limit, sortBy),
    queryFn: () => tripsApi.getDriverUtilization(dateRange, limit, sortBy),
    staleTime: 60_000,
  });
}

/** Distance Distribution histogram. */
export function useTripDistanceDistribution(dateRange?: DateRange) {
  return useQuery({
    queryKey: tripAnalyticsKeys.distanceDistribution(rangeKey(dateRange)),
    queryFn: () => tripsApi.getDistanceDistribution(dateRange),
    staleTime: 60_000,
  });
}

/** Day-of-week x hour-of-day heatmap. */
export function useTripDayOfWeekHeatmap(dateRange?: DateRange) {
  return useQuery({
    queryKey: tripAnalyticsKeys.dayOfWeek(rangeKey(dateRange)),
    queryFn: () => tripsApi.getDayOfWeekHeatmap(dateRange),
    staleTime: 60_000,
  });
}