// frontend/modules/leaderboard/hooks/useFleetLeaderboard.ts
//
// TanStack Query hooks for the Fleet Leaderboard. Every query is
// permission-gated client-side so a role that would only ever get a 403
// issues no request at all -- the server's withAuth wrapper remains the
// actual enforcement point (see each route), this only avoids a
// guaranteed-failing fetch and the error UI that comes with it.
//
// PERMISSIONS ARE NOT UNIFORM ACROSS THIS PAGE, and that is the point
// of splitting the queries:
//
//   GET /api/ai/dashboard    Permission.ANALYTICS_VIEW
//   GET /api/reminders?...   Permission.MAINTENANCE_VIEW
//
// A Fleet Manager holds both; some analyst roles hold ANALYTICS_VIEW
// without MAINTENANCE_VIEW, and some maintenance roles the reverse.
// Either half must degrade on its own -- the leaderboards it feeds show
// their own empty state while the rest of the page keeps working --
// rather than one missing permission blanking the page.

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { Permission, permissionService } from '@/server/permissions/roles';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { ApiError } from '@/shared/utils/api-client.utils';
import { leaderboardApi } from '../services/leaderboard.api';
import type {
  AiDashboardSummary,
  MaintenanceStats,
  MostExpensiveVehicleRow,
  RepairFrequencyByVehicleRow,
  VehicleLeaderboardMetric,
} from '../types';

export const leaderboardKeys = {
  all: ['leaderboard'] as const,
  aiDashboard: () => [...leaderboardKeys.all, 'ai-dashboard'] as const,
  maintenanceStats: () => [...leaderboardKeys.all, 'maintenance-stats'] as const,
  maintenanceCost: (limit: number) => [...leaderboardKeys.all, 'maintenance-cost', limit] as const,
  repairCount: (limit: number) => [...leaderboardKeys.all, 'repair-count', limit] as const,
};

/**
 * GET /api/ai/dashboard is expensive: it runs five AI services over
 * trip, telematics, fuel, expense and maintenance history in one
 * request, which is why its route carries `maxDuration = 60`. It is a
 * computed-on-read analytics rollup, not a live feed.
 *
 * So: a long staleTime, no refetchInterval, no refetch-on-focus, and a
 * single retry. Polling this would put fleet-wide recomputation on a
 * timer for a page somebody left open, and the numbers do not move
 * fast enough for anyone to notice the difference. Matches the
 * reasoning in useDriverRisk.ts, scaled up because this endpoint does
 * five services' work rather than one.
 */
const AI_DASHBOARD_STALE_TIME = 5 * 60_000;

/** The maintenance aggregations are cheap Mongo rollups; the ai module's 60s is right for them. */
const MAINTENANCE_STALE_TIME = 60_000;

/** A permission failure will not resolve by trying again with the same token. */
function isNotForbidden(error: unknown): boolean {
  return !(error instanceof ApiError && error.statusCode === 403);
}

function retryUnlessForbidden(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && isNotForbidden(error);
}

/**
 * Which halves of the page the current user can load.
 *
 * Read from the session store rather than useAuth() so this stays
 * usable from a non-component context and does not pull the auth flow's
 * router dependency into a data hook -- the same read
 * useSavingsStripAccess() in the attention module makes.
 */
export function useLeaderboardAccess(): {
  canReadAi: boolean;
  canReadMaintenance: boolean;
  /** False when the user can load neither half -- the page should say so instead of rendering empty cards. */
  hasAnyAccess: boolean;
} {
  const { user } = useSessionStore();
  const roles = user?.roles ?? [];
  const canReadAi = permissionService.hasPermission(roles, Permission.ANALYTICS_VIEW);
  const canReadMaintenance = permissionService.hasPermission(roles, Permission.MAINTENANCE_VIEW);

  return { canReadAi, canReadMaintenance, hasAnyAccess: canReadAi || canReadMaintenance };
}

/**
 * The combined AI rollup. One request feeds the driver leaderboard, the
 * vehicle "open alerts" metric, and four of the seven category tiles --
 * see leaderboard.api.ts for why this is one call rather than four.
 */
export function useAiDashboard(options?: Partial<UseQueryOptions<AiDashboardSummary>>) {
  const { canReadAi } = useLeaderboardAccess();

  return useQuery({
    queryKey: leaderboardKeys.aiDashboard(),
    queryFn: () => leaderboardApi.getAiDashboard(),
    enabled: canReadAi,
    staleTime: AI_DASHBOARD_STALE_TIME,
    refetchOnWindowFocus: false,
    retry: retryUnlessForbidden,
    ...options,
  });
}

/** Fleet-wide reminder counts. Backs the "Maintenance due" tile. */
export function useMaintenanceStats(options?: Partial<UseQueryOptions<MaintenanceStats>>) {
  const { canReadMaintenance } = useLeaderboardAccess();

  return useQuery({
    queryKey: leaderboardKeys.maintenanceStats(),
    queryFn: () => leaderboardApi.getMaintenanceStats(),
    enabled: canReadMaintenance,
    staleTime: MAINTENANCE_STALE_TIME,
    retry: retryUnlessForbidden,
    ...options,
  });
}

/**
 * Vehicles by cumulative estimated maintenance cost, ranked server-side.
 *
 * `enabled` also gates on the active metric so switching the vehicle
 * leaderboard's metric does not fire all three underlying requests --
 * only the one the user is looking at. The other two stay cached from
 * whenever they were last viewed.
 */
export function useMostExpensiveVehicles(
  limit: number,
  enabled: boolean,
  options?: Partial<UseQueryOptions<MostExpensiveVehicleRow[]>>
) {
  const { canReadMaintenance } = useLeaderboardAccess();

  return useQuery({
    queryKey: leaderboardKeys.maintenanceCost(limit),
    queryFn: () => leaderboardApi.getMostExpensiveVehicles(limit),
    enabled: enabled && canReadMaintenance,
    staleTime: MAINTENANCE_STALE_TIME,
    retry: retryUnlessForbidden,
    ...options,
  });
}

/** Vehicles by count of completed maintenance records, ranked server-side. */
export function useRepairFrequencyByVehicle(
  limit: number,
  enabled: boolean,
  options?: Partial<UseQueryOptions<RepairFrequencyByVehicleRow[]>>
) {
  const { canReadMaintenance } = useLeaderboardAccess();

  return useQuery({
    queryKey: leaderboardKeys.repairCount(limit),
    queryFn: () => leaderboardApi.getRepairFrequencyByVehicle(limit),
    enabled: enabled && canReadMaintenance,
    staleTime: MAINTENANCE_STALE_TIME,
    retry: retryUnlessForbidden,
    ...options,
  });
}

/**
 * Which permission the currently-selected vehicle metric needs.
 *
 * 'open-alerts' is derived from the AI dashboard (ANALYTICS_VIEW); the
 * other two come from the maintenance aggregations (MAINTENANCE_VIEW).
 * The page uses this to show the right "you don't have access to this
 * view" message instead of an empty chart.
 */
export function vehicleMetricPermission(metric: VehicleLeaderboardMetric): Permission {
  return metric === 'open-alerts' ? Permission.ANALYTICS_VIEW : Permission.MAINTENANCE_VIEW;
}
