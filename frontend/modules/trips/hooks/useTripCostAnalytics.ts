// frontend/modules/trips/hooks/useTripCostAnalytics.ts
//
// PHASE 3: cross-module cost analytics (Fuel per Trip / Expense per
// Trip / Cost per Trip / Fuel vs Distance / Cost vs Distance).
//
// VEHICLE-SCOPE ADDITION: optional `licensePlate` on both hooks, so
// VehicleTripAnalyticsPanel gets a single vehicle's linked cost rows
// and summary instead of the fleet's.

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/utils/api-client.utils';
import type { TripCostAnalyticsRow, TripCostSummary } from '../types';

type DateRange = { startDate?: Date; endDate?: Date } | undefined;

function buildRangeQuery(dateRange?: DateRange, licensePlate?: string) {
  const params: Record<string, string | undefined> = {};
  if (dateRange?.startDate) params.startDate = dateRange.startDate.toISOString();
  if (dateRange?.endDate) params.endDate = dateRange.endDate.toISOString();
  if (licensePlate) params.license_plate = licensePlate;
  return params;
}

function rangeKey(dateRange?: DateRange): string | undefined {
  return dateRange
    ? `${dateRange.startDate?.toISOString() ?? ''}-${dateRange.endDate?.toISOString() ?? ''}`
    : undefined;
}

export function useTripCostAnalytics(dateRange?: DateRange, limit: number = 100, licensePlate?: string) {
  return useQuery({
    queryKey: ['trips', 'cost-analytics', rangeKey(dateRange), limit, licensePlate],
    queryFn: () =>
      apiClient.get<TripCostAnalyticsRow[]>('/api/trips/cost-analytics', {
        params: { ...buildRangeQuery(dateRange, licensePlate), limit },
      }),
    staleTime: 60_000,
  });
}

export function useTripCostSummary(dateRange?: DateRange, licensePlate?: string) {
  return useQuery({
    queryKey: ['trips', 'cost-summary', rangeKey(dateRange), licensePlate],
    queryFn: () =>
      apiClient.get<TripCostSummary>('/api/trips/cost-summary', {
        params: buildRangeQuery(dateRange, licensePlate),
      }),
    staleTime: 60_000,
  });
}