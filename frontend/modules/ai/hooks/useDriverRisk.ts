// frontend/modules/ai/hooks/useDriverRisk.ts

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { driverRiskApi } from '../services/driver-risk.api';
import type { DriverRiskScore, DriverRiskBatchResult, DriverRiskTrendPoint } from '../types/driver-risk.types';

export const driverRiskKeys = {
  all: ['ai', 'driverRisk'] as const,
  lists: () => [...driverRiskKeys.all, 'list'] as const,
  details: () => [...driverRiskKeys.all, 'detail'] as const,
  detail: (driverId: string) => [...driverRiskKeys.details(), driverId] as const,
};

/**
 * GET /api/ai/driver-risk -- every driver in the caller's scope. Used
 * to power the driver-scorecard picker (see DriverScorecardPage): the
 * ids surfaced here are the only ones guaranteed to round-trip into
 * useDriverRisk(driverId) below.
 *
 * No refetchInterval: this is a computed-on-read analytics score over
 * trip/telematics history, not a live feed -- nothing here changes
 * fast enough to warrant polling, and recalculating it fleet-wide is
 * not free (see calculateDriverRisk's per-driver trip/telematics
 * reads). staleTime is set higher than the workflows module's
 * near-real-time queries for the same reason.
 */
export function useDriverRiskList(options?: Partial<UseQueryOptions<DriverRiskBatchResult>>) {
  return useQuery({
    queryKey: driverRiskKeys.lists(),
    queryFn: () => driverRiskApi.listDriverRisk(),
    staleTime: 60_000,
    ...options,
  });
}

/**
 * GET /api/ai/driver-risk?driverId=X -- one driver's full scorecard
 * (metrics, trends, incidents, recommendations, evidence).
 *
 * `driverId` is the OrganizationMember.userId the driver-risk endpoint
 * itself uses (entityId in the batch response) -- NOT a tbldrivers
 * _id. See the doc comment on DriverRiskScore.driverId in ../types.
 */
export function useDriverRisk(
  driverId: string | undefined,
  options?: Partial<UseQueryOptions<DriverRiskScore>>
) {
  return useQuery({
    queryKey: driverRiskKeys.detail(driverId ?? ''),
    queryFn: () => driverRiskApi.getDriverRisk(driverId as string),
    enabled: Boolean(driverId),
    staleTime: 60_000,
    ...options,
  });
}

/**
 * Derives the trend series for a driver from the same query
 * useDriverRisk(driverId) already fetches, rather than hitting a
 * separate endpoint.
 *
 * There is no range/trend query param on GET /api/ai/driver-risk --
 * generateRiskTrends() (driver-risk.service.ts) always computes a
 * fixed set of 7-day windows over the last 28 days server-side, with
 * no way to ask for a different range. A dedicated
 * useDriverRiskTrend(driverId, range) that actually varied the window
 * would be calling an endpoint that can't honor the request, so this
 * is a `select`-based view over useDriverRisk's cache entry instead:
 * it shares the same query (no extra network request, same
 * staleTime/cache lifetime) and simply narrows what the caller reads
 * from it.
 */
export function useDriverRiskTrend(
  driverId: string | undefined
): { data: DriverRiskTrendPoint[] | undefined; isLoading: boolean; isError: boolean } {
  const { data, isLoading, isError } = useDriverRisk(driverId);

  return { data: data?.trends, isLoading, isError };
}
