// frontend/modules/onboarding/hooks/useFleetPresence.ts

'use client';

import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/frontend/modules/dashboard/services/dashboard.api';
import { dashboardKeys } from '@/frontend/modules/dashboard/hooks/useDashboardData';
import { Permission, permissionService } from '@/server/permissions/roles';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { fleetPresence, type FleetPresence } from '../utils/empty-state-copy';

/**
 * "Does this organisation have any vehicles?" — the one extra fact every
 * empty state needs in order to tell "nothing to do" from "nothing set
 * up". See empty-state-copy.ts for why that distinction matters.
 *
 * ---------------------------------------------------------------------
 * COSTS NOTHING ON THE PAGES THAT USE IT
 * ---------------------------------------------------------------------
 * It reuses `dashboardKeys.vehicleStats` AND `dashboardApi.getVehicleStats`
 * — the exact key and queryFn that KPIsWidget, FleetStatusWidget and
 * useSetupProgress already hold. On the dashboard and the command centre
 * this is a cache read, not a request, and it cannot drift into a
 * second, differently-computed total. (Same discipline as
 * useSetupProgress; its header records why.)
 *
 * ---------------------------------------------------------------------
 * FAILS TO `unknown`, NOT TO `empty`
 * ---------------------------------------------------------------------
 * `fleetPresence` is given `isSuccess`, so a pending or failed count
 * yields `unknown` and every consumer falls back to the
 * established-fleet wording. Reading a failed request as "no vehicles"
 * would tell a customer with 400 trucks to add their first one.
 *
 * A caller without VEHICLE_VIEW never issues the query — they cannot
 * read the count, and a driver looking at their own empty queue does not
 * need to be told to go and create a fleet.
 */
export function useFleetPresence(): FleetPresence {
  const roles = useSessionStore((s) => s.user?.roles) ?? [];
  const canRead = permissionService.hasPermission(roles, Permission.VEHICLE_VIEW);

  const { data, isSuccess } = useQuery({
    queryKey: dashboardKeys.vehicleStats,
    queryFn: dashboardApi.getVehicleStats,
    staleTime: 60_000,
    enabled: canRead,
  });

  if (!canRead) return 'unknown';
  return fleetPresence(data?.total, isSuccess);
}
