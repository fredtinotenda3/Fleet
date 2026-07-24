
// frontend/modules/trips/hooks/useTripCostAnalytics.ts
//
// PHASE 3: cross-module cost analytics (Fuel per Trip / Expense per
// Trip / Cost per Trip / Fuel vs Distance / Cost vs Distance).

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/utils/api-client.utils';
import type { TripCostAnalyticsRow, TripCostSummary } from '../types';

type DateRange = { startDate?: Date; endDate?: Date } | undefined;

function buildRangeQuery(dateRange?: DateRange) {
  const params: Record<string, string | undefined> = {};
  if (dateRange?.startDate) params.startDate = dateRange.startDate.toISOString();
  if (dateRange?.endDate) params.endDate = dateRange.endDate.toISOString();
  return params;
}

function rangeKey(dateRange?: DateRange): string | undefined {
  return dateRange
    ? `${dateRange.startDate?.toISOString() ?? ''}-${dateRange.endDate?.toISOString() ?? ''}`
    : undefined;
}

export function useTripCostAnalytics(dateRange?: DateRange, limit: number = 100) {
  return useQuery({
    queryKey: ['trips', 'cost-analytics', rangeKey(dateRange), limit],
    queryFn: () =>
      apiClient.get<TripCostAnalyticsRow[]>('/api/trips/cost-analytics', {
        params: { ...buildRangeQuery(dateRange), limit },
      }),
    staleTime: 60_000,
  });
}

export function useTripCostSummary(dateRange?: DateRange) {
  return useQuery({
    queryKey: ['trips', 'cost-summary', rangeKey(dateRange)],
    queryFn: () =>
      apiClient.get<TripCostSummary>('/api/trips/cost-summary', {
        params: buildRangeQuery(dateRange),
      }),
    staleTime: 60_000,
  });
}
