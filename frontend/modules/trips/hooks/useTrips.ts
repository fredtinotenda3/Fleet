// frontend/modules/trips/hooks/useTrips.ts

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { apiClient } from '@/shared/utils/api-client.utils';
import { tripsApi, type TripListParams } from '../services/trips.api';
import type { Trip, DistanceUnitOption } from '../types';

type DateRange = { startDate?: Date; endDate?: Date };

function rangeKey(dateRange?: DateRange): string | undefined {
  if (!dateRange) return undefined;
  return `${dateRange.startDate?.toISOString() ?? ''}-${dateRange.endDate?.toISOString() ?? ''}`;
}

export const tripKeys = {
  all: ['trips'] as const,
  lists: () => [...tripKeys.all, 'list'] as const,
  list: (params: Partial<TripListParams>) => [...tripKeys.lists(), params] as const,
  details: () => [...tripKeys.all, 'detail'] as const,
  detail: (id: string) => [...tripKeys.details(), id] as const,
  stats: (range?: string) => [...tripKeys.all, 'stats', range] as const,
  kpis: (range?: string) => [...tripKeys.all, 'kpis', range] as const,
  exceptions: (range?: string, zThreshold?: number) =>
    [...tripKeys.all, 'exceptions', range, zThreshold] as const,
};

export function useTripsList(params: Partial<TripListParams>) {
  return useQuery({
    queryKey: tripKeys.list(params),
    queryFn: () => tripsApi.list(params),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

export function useTrip(id: string | undefined, options?: Partial<UseQueryOptions<Trip>>) {
  return useQuery({
    queryKey: tripKeys.detail(id ?? ''),
    queryFn: () => tripsApi.getById(id as string),
    enabled: Boolean(id),
    staleTime: 30_000,
    ...options,
  });
}

export function useTripStats(dateRange?: DateRange) {
  return useQuery({
    queryKey: tripKeys.stats(rangeKey(dateRange)),
    queryFn: () => tripsApi.getStats(dateRange),
    staleTime: 60_000,
  });
}

/** PHASE 1: executive KPI cards for the Trip Analytics page. */
export function useTripKpis(dateRange?: DateRange) {
  return useQuery({
    queryKey: tripKeys.kpis(rangeKey(dateRange)),
    queryFn: () => tripsApi.getKpis(dateRange),
    staleTime: 60_000,
  });
}

/** PHASE 1: exception analytics (duration outliers, odometer
 *  inconsistencies, possible duplicates, missing driver). */
export function useTripExceptions(dateRange?: DateRange, zThreshold: number = 2.5, limit: number = 50) {
  return useQuery({
    queryKey: tripKeys.exceptions(rangeKey(dateRange), zThreshold),
    queryFn: () => tripsApi.getExceptions(dateRange, zThreshold, limit),
    staleTime: 60_000,
  });
}

/**
 * Distance-type units for the trip form's unit selector. Reuses the
 * existing /api/units endpoint (shared with vehicles/fuel/meter logs)
 * rather than inventing a trips-specific one.
 */
export function useDistanceUnits() {
  return useQuery({
    queryKey: ['units'],
    queryFn: () => apiClient.get<DistanceUnitOption[]>('/api/units'),
    staleTime: 5 * 60_000,
    select: (units) => units.filter((u) => u.type === 'distance'),
  });
}
