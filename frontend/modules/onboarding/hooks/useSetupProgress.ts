// frontend/modules/onboarding/hooks/useSetupProgress.ts

'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/frontend/modules/dashboard/services/dashboard.api';
import { dashboardKeys } from '@/frontend/modules/dashboard/hooks/useDashboardData';
import { Permission, permissionService } from '@/server/permissions/roles';
import { organizationApi } from '@/frontend/modules/organizations/services/organization.api';
import { driversApi } from '@/frontend/modules/drivers/services/drivers.api';
import { telematicsApi } from '@/frontend/modules/telematics/services/telematics.api';
import { organizationKeys, orgUnitKeys } from '@/frontend/modules/organizations/hooks/query-keys';
import { telematicsKeys } from '@/frontend/modules/telematics/hooks/useLiveMap';
import { driverKeys } from '@/frontend/modules/drivers/hooks/useDrivers';
import { useOrganizationStore } from '@/frontend/modules/organizations/store/organization.store';
import { fuelCardsApi } from '@/frontend/modules/fuel-cards/services/fuel-cards.api';
import { fuelCardKeys } from '@/frontend/modules/fuel-cards/hooks/useFuelCards';
import { fuelStationsApi } from '@/frontend/modules/fuel-stations/services/fuel-stations.api';
import { fuelStationKeys } from '@/frontend/modules/fuel-stations/hooks/useFuelStations';
import { maintenanceApi } from '@/frontend/modules/maintenance/services/maintenance.api';
import { maintenanceKeys } from '@/frontend/modules/maintenance/hooks/useMaintenance';
import { tripsApi } from '@/frontend/modules/trips/services/trips.api';
import { tripKeys } from '@/frontend/modules/trips/hooks/useTrips';
import {
  buildSetupChecklist,
  summariseSetup,
  EMPTY_SETUP_FACTS,
  type SetupFacts,
  type SetupProgress,
} from '../utils/setup-checklist';

/**
 * COST CONTROL — read before adding a query here.
 *
 * This hook runs on the dashboard, which is the most-loaded page in the
 * product. Three rules keep it from becoming a performance regression:
 *
 * 1. Every query reuses the query key an existing feature already uses, so
 *    on the dashboard they are cache hits rather than new requests:
 *      - vehicle stats  -> ['dashboard','vehicle-stats'] (KPIsWidget and
 *        FleetStatusWidget already fetch it)
 *      - org units      -> orgUnitKeys.list({}) (organizations module)
 *      - drivers        -> driverKeys.list({ limit: 1 })
 *      - telematics     -> telematicsKeys.eagletrack/cartrackConfig()
 *
 * 2. Every query is `enabled` only when the user holds the permission for
 *    the step it feeds. A driver triggers none of them.
 *
 * 3. Every query is disabled outright once onboarding is dismissed or
 *    complete (`enabled` prop). A finished organization pays nothing.
 *
 * Deliberately NOT used here: GET /api/ai/needs-attention. It fans out over
 * seven AI services and persists a snapshot, carries `maxDuration = 60`, and
 * has already caused a production timeout incident. Nothing in onboarding is
 * worth that.
 */

const SETUP_STALE_TIME = 5 * 60_000;

function useCanAll(roles: string[]) {
  return useMemo(
    () => ({
      orgUnits: permissionService.hasPermission(roles, Permission.ORG_UNIT_MANAGE),
      vehicles: permissionService.hasPermission(roles, Permission.VEHICLE_CREATE),
      drivers: permissionService.hasPermission(roles, Permission.VEHICLE_EDIT),
      members: permissionService.hasPermission(roles, Permission.ORG_MEMBERS_MANAGE),
      telematics: permissionService.hasPermission(roles, Permission.ORG_SETTINGS),
      operatingData: permissionService.hasPermission(roles, Permission.FUEL_CREATE),
      // ADAPTIVE ONBOARDING additions. Gated on the READ permission each
      // probe query actually needs (GET .../FUEL_VIEW etc.), not the
      // write permission the step's own action requires -- a step whose
      // write permission a user holds but whose read permission they
      // don't would otherwise 403 on every page load. See the matching
      // `readPermission` fields in setup-checklist.ts's STEP_DEFINITIONS.
      fuelSetupRead: permissionService.hasPermission(roles, Permission.FUEL_VIEW),
      maintenanceSetupRead: permissionService.hasPermission(roles, Permission.MAINTENANCE_VIEW),
      tripOperationsRead: permissionService.hasPermission(roles, Permission.TRIP_VIEW),
    }),
    [roles]
  );
}

export function useSetupProgress(roles: string[], enabled: boolean): SetupProgress & { isLoading: boolean } {
  const can = useCanAll(roles);
  const on = (permitted: boolean) => enabled && permitted;
  const currentOrganizationId = useOrganizationStore((state) => state.currentOrganizationId);

  // Same key AND same queryFn as useVehicleStatsWidget, so this is a cache
  // hit on the dashboard rather than a second request.
  const vehicleStats = useQuery({
    // The exported key rather than a hand-written copy of it: the tuple
    // was duplicated here, and a duplicate stops being a cache hit the
    // moment the original changes.
    queryKey: dashboardKeys.vehicleStats,
    queryFn: dashboardApi.getVehicleStats,
    staleTime: 60_000,
    enabled: on(can.vehicles),
  });

  const orgUnits = useQuery({
    queryKey: orgUnitKeys.list({}),
    queryFn: () => organizationApi.listOrgUnits(),
    staleTime: SETUP_STALE_TIME,
    enabled: on(can.orgUnits),
  });

  // GET /api/organizations returns each organization with its `members`
  // array, and the TopBar's OrganizationSwitcher already holds this exact
  // query on every page (useMyOrganizations -> organizationKeys.lists()).
  // Reading the count from that cache costs nothing, and it is the only
  // member count the frontend can obtain: there is no GET handler on
  // /api/organizations/[id]/members — only POST and DELETE.
  const organizations = useQuery({
    queryKey: organizationKeys.lists(),
    queryFn: () => organizationApi.getMyOrganizations(),
    staleTime: 60_000,
    enabled: on(can.members),
  });

  // limit: 1 — this needs a count, not a roster. The response's
  // `pagination.total` is the whole answer.
  const drivers = useQuery({
    queryKey: driverKeys.list({ page: 1, limit: 1 }),
    queryFn: () => driversApi.list({ page: 1, limit: 1 }),
    staleTime: SETUP_STALE_TIME,
    enabled: on(can.drivers),
  });

  const eagletrack = useQuery({
    queryKey: telematicsKeys.eagletrackConfig(),
    queryFn: () => telematicsApi.getEagleTrackConfig(),
    staleTime: SETUP_STALE_TIME,
    retry: 0,
    enabled: on(can.telematics),
  });

  const cartrack = useQuery({
    queryKey: telematicsKeys.cartrackConfig(),
    queryFn: () => telematicsApi.getCartrackConfig(),
    staleTime: SETUP_STALE_TIME,
    retry: 0,
    enabled: on(can.telematics),
  });

  // Expense stats doubles as the "has this fleet produced any operating
  // record" probe. Reuses the ExpensesWidget's key AND its exact queryFn
  // (dashboardApi.getExpenseStats), so on the dashboard it costs nothing and
  // cannot drift into a second, differently-computed total — the mismatch
  // that dashboard.api.ts's own comment records having already been fixed
  // once.
  const expenseStats = useQuery({
    queryKey: dashboardKeys.expenses,
    queryFn: dashboardApi.getExpenseStats,
    staleTime: 60_000,
    enabled: on(can.operatingData),
  });

  // --- ADAPTIVE ONBOARDING additions -----------------------------------
  // Each is a `limit: 1` existence probe exactly like the `drivers` query
  // above: the answer needed is "does at least one exist", not a roster,
  // so `pagination.total` is the whole answer and the payload stays tiny.
  const fuelCards = useQuery({
    queryKey: fuelCardKeys.list({ page: 1, limit: 1 }),
    queryFn: () => fuelCardsApi.list({ page: 1, limit: 1 }),
    staleTime: SETUP_STALE_TIME,
    enabled: on(can.fuelSetupRead),
  });

  const fuelStations = useQuery({
    queryKey: fuelStationKeys.list({ page: 1, limit: 1 }),
    queryFn: () => fuelStationsApi.list({ page: 1, limit: 1 }),
    staleTime: SETUP_STALE_TIME,
    enabled: on(can.fuelSetupRead),
  });

  const maintenanceReminders = useQuery({
    queryKey: maintenanceKeys.list({ page: 1, limit: 1 }),
    queryFn: () => maintenanceApi.list({ page: 1, limit: 1 }),
    staleTime: SETUP_STALE_TIME,
    enabled: on(can.maintenanceSetupRead),
  });

  const trips = useQuery({
    queryKey: tripKeys.list({ page: 1, limit: 1 }),
    queryFn: () => tripsApi.list({ page: 1, limit: 1 }),
    staleTime: SETUP_STALE_TIME,
    enabled: on(can.tripOperationsRead),
  });

  const facts: SetupFacts = useMemo(() => {
    // `settled` distinguishes "answered" from "still working / failed". A
    // pending or failed query must yield null, never 0 — see the note on
    // `indeterminate` in setup-checklist.ts.
    const settled = <T,>(query: { data?: T; isSuccess: boolean }, read: (data: T) => number | boolean) =>
      query.isSuccess && query.data !== undefined ? read(query.data) : null;

    const telematicsConnected =
      eagletrack.isSuccess || cartrack.isSuccess
        ? Boolean(
            (eagletrack.data?.configured && eagletrack.data?.enabled) ||
              (cartrack.data?.configured && cartrack.data?.enabled)
          )
        : null;

    // The currently-selected organization, resolved once and reused for
    // both memberCount (already existed) and the two fleet-profile
    // declarations below — same org, same lookup, no second query.
    const activeOrganization = organizations.isSuccess
      ? organizations.data.find((org) => org._id === currentOrganizationId) ?? organizations.data[0]
      : undefined;

    return {
      ...EMPTY_SETUP_FACTS,
      vehicleCount: settled(vehicleStats, (data) => data.total) as number | null,
      orgUnitCount: settled(orgUnits, (data) => data.length) as number | null,
      driverCount: settled(drivers, (data) => data.pagination?.total ?? data.data.length) as number | null,
      telematicsConnected,
      // More than one member means somebody other than the founding
      // account exists. A count of exactly 1 is the owner alone.
      memberCount: organizations.isSuccess ? (activeOrganization?.members?.length ?? 0) : null,
      // ExpenseStats.total is the aggregate produced by
      // ExpenseRepository.getExpenseStats. Any non-zero value means the
      // fleet has recorded at least one operating cost.
      hasOperatingData: settled(expenseStats, (data) => (data?.total ?? 0) > 0) as boolean | null,
      // Operator DECLARATIONS (OrganizationFleetProfile), read off the
      // SAME organizations query `memberCount` already depends on — this
      // is a cache hit everywhere `organizations` was already enabled,
      // never a new request. `undefined` on the stored field (never
      // declared) correctly collapses to `null` (undeclared), same as
      // every other not-yet-answered fact in this hook.
      operatesWithoutGps: organizations.isSuccess
        ? (activeOrganization?.fleetProfile?.operatesWithoutGps ?? null)
        : null,
      operatesWithoutOdometers: organizations.isSuccess
        ? (activeOrganization?.fleetProfile?.operatesWithoutOdometers ?? null)
        : null,
      fuelSetupDone:
        fuelCards.isSuccess && fuelStations.isSuccess
          ? (fuelCards.data.pagination?.total ?? 0) > 0 || (fuelStations.data.pagination?.total ?? 0) > 0
          : null,
      maintenanceSetupDone: settled(
        maintenanceReminders,
        (data) => (data.pagination?.total ?? 0) > 0
      ) as boolean | null,
      tripRecorded: settled(trips, (data) => (data.pagination?.total ?? 0) > 0) as boolean | null,
    };
  }, [
    vehicleStats.isSuccess,
    vehicleStats.data,
    orgUnits.isSuccess,
    orgUnits.data,
    drivers.isSuccess,
    drivers.data,
    fuelCards.isSuccess,
    fuelCards.data,
    fuelStations.isSuccess,
    fuelStations.data,
    maintenanceReminders.isSuccess,
    maintenanceReminders.data,
    trips.isSuccess,
    trips.data,
    eagletrack.isSuccess,
    eagletrack.data,
    cartrack.isSuccess,
    cartrack.data,
    expenseStats.isSuccess,
    expenseStats.data,
    organizations.isSuccess,
    organizations.data,
    currentOrganizationId,
  ]);

  const progress = useMemo(() => summariseSetup(buildSetupChecklist(roles, facts)), [roles, facts]);

  const isLoading =
    enabled &&
    (vehicleStats.isLoading ||
      orgUnits.isLoading ||
      drivers.isLoading ||
      organizations.isLoading ||
      eagletrack.isLoading ||
      cartrack.isLoading ||
      expenseStats.isLoading ||
      fuelCards.isLoading ||
      fuelStations.isLoading ||
      maintenanceReminders.isLoading ||
      trips.isLoading);

  return { ...progress, isLoading };
}
