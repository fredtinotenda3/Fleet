// frontend/modules/leaderboard/pages/FleetLeaderboardPage.tsx
//
// Fleet Leaderboard: alert-category tiles, a driver ranking and a
// vehicle ranking, built entirely on endpoints that already exist. No
// backend route, permission or response shape was added or changed for
// this page.
//
// PERMISSIONS. The page reads two independently-gated groups:
//
//   Permission.ANALYTICS_VIEW    GET /api/ai/dashboard
//   Permission.MAINTENANCE_VIEW  GET /api/reminders?action=...
//
// It gates on holding EITHER, not both, and each card degrades on its
// own -- a role with analytics but not maintenance sees the driver
// board and four tiles, and an explicit "not available to your role"
// message where the maintenance data would be. These client-side checks
// are a UI convenience: they replace a guaranteed 403 with a readable
// message. Each route's own withAuth wrapper remains the enforcement
// point and is unaffected by anything here.
//
// SELECTORS, NOT DERIVED STATE. Every ranking below is computed with a
// useMemo over the query cache rather than copied into useState. A
// second copy in state is a second source of truth that goes stale the
// moment a refetch lands, and it is how a leaderboard ends up
// disagreeing with the tiles above it on the same screen.

'use client';

import { useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Permission, permissionService } from '@/server/permissions/roles';
import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import {
  useAiDashboard,
  useLeaderboardAccess,
  useMaintenanceStats,
  useMostExpensiveVehicles,
  useRepairFrequencyByVehicle,
} from '../hooks/useFleetLeaderboard';
import { AlertCategoryTiles } from '../components/AlertCategoryTiles';
import { DriverLeaderboardCard } from '../components/DriverLeaderboardCard';
import { VehicleLeaderboardCard, type VehicleLeaderboardData } from '../components/VehicleLeaderboardCard';
import {
  buildAlertCategoryTiles,
  buildDriverLeaderboard,
  buildMaintenanceCostLeaderboard,
  buildRepairCountLeaderboard,
  buildVehicleAlertLeaderboard,
  countBatchFindings,
  scheduledMaintenanceCaption,
  sumBy,
  toDriverLeaderboardRows,
} from '../utils';
import type { DriverLeaderboardMetric, VehicleLeaderboardMetric } from '../types';

/** How many rows each board shows. Also the `limit` sent to the server-ranked aggregations. */
const LEADERBOARD_SIZE = 10;

export function FleetLeaderboardPage() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const canReadAi = permissionService.hasPermission(roles, Permission.ANALYTICS_VIEW);
  const canReadMaintenance = permissionService.hasPermission(roles, Permission.MAINTENANCE_VIEW);
  const { hasAnyAccess } = useLeaderboardAccess();

  const [driverMetric, setDriverMetric] = useState<DriverLeaderboardMetric>('risk-score');

  /**
   * `null` means "the user hasn't picked yet", and the default is
   * resolved from permissions on every render until they do.
   *
   * NOT a permission-derived useState initializer. That initializer runs
   * once, on the first render -- which happens before the session store
   * has rehydrated, when `roles` is still empty and every permission
   * check answers false. An analytics-only fleet manager would have been
   * pinned to whichever metric the empty-roles branch chose and stayed
   * there after their real roles arrived. Resolving the fallback at read
   * time costs nothing and cannot go stale.
   */
  const [vehicleMetricChoice, setVehicleMetricChoice] = useState<VehicleLeaderboardMetric | null>(null);
  const vehicleMetric: VehicleLeaderboardMetric =
    vehicleMetricChoice ?? (canReadMaintenance ? 'maintenance-cost' : 'open-alerts');

  const ai = useAiDashboard();
  const maintenanceStats = useMaintenanceStats();
  const costRows = useMostExpensiveVehicles(LEADERBOARD_SIZE, vehicleMetric === 'maintenance-cost');
  const repairRows = useRepairFrequencyByVehicle(LEADERBOARD_SIZE, vehicleMetric === 'repair-count');

  // ── Tiles ────────────────────────────────────────────────────────────

  const tiles = useMemo(() => {
    const summary = ai.data ?? null;

    // Summed across the SCORED drivers only. toDriverLeaderboardRows
    // drops unscored drivers, so this never counts a driver the model
    // could not evaluate as having zero events -- which would understate
    // the fleet's totals while looking like a measurement.
    const driverRows = toDriverLeaderboardRows(summary?.driverRisk);
    const driverRisk = summary?.driverRisk
      ? {
          speedingEvents: sumBy(driverRows, (row) => row.speedingEvents),
          hardBrakes: sumBy(driverRows, (row) => row.hardBrakes),
        }
      : null;

    return buildAlertCategoryTiles({
      driverRisk,
      fuelFraudCount: countBatchFindings(summary?.fuelFraud),
      expenseAnomalyCount: countBatchFindings(summary?.expenseAnomalies),
      maintenanceOverdue: maintenanceStats.data?.overdue ?? null,
      maintenanceScheduled: maintenanceStats.data?.pending ?? null,
      aiStatus: !canReadAi || ai.isError ? 'error' : ai.isLoading ? 'loading' : 'ready',
      maintenanceStatus:
        !canReadMaintenance || maintenanceStats.isError
          ? 'error'
          : maintenanceStats.isLoading
            ? 'loading'
            : 'ready',
    });
  }, [
    ai.data,
    ai.isError,
    ai.isLoading,
    canReadAi,
    canReadMaintenance,
    maintenanceStats.data,
    maintenanceStats.isError,
    maintenanceStats.isLoading,
  ]);

  const tileCaptions = useMemo(
    () => ({
      maintenance_due: scheduledMaintenanceCaption(maintenanceStats.data?.pending ?? null),
    }),
    [maintenanceStats.data]
  );

  // ── Driver board ─────────────────────────────────────────────────────

  const driverRows = useMemo(
    () => buildDriverLeaderboard(ai.data?.driverRisk, driverMetric, LEADERBOARD_SIZE),
    [ai.data, driverMetric]
  );

  // ── Vehicle board ────────────────────────────────────────────────────

  const vehicleAlertRows = useMemo(
    () => buildVehicleAlertLeaderboard(ai.data, LEADERBOARD_SIZE),
    [ai.data]
  );
  const vehicleCostRows = useMemo(
    () => buildMaintenanceCostLeaderboard(costRows.data, LEADERBOARD_SIZE),
    [costRows.data]
  );
  const vehicleRepairRows = useMemo(
    () => buildRepairCountLeaderboard(repairRows.data, LEADERBOARD_SIZE),
    [repairRows.data]
  );

  const vehicleData: VehicleLeaderboardData =
    vehicleMetric === 'maintenance-cost'
      ? { metric: 'maintenance-cost', rows: vehicleCostRows }
      : vehicleMetric === 'repair-count'
        ? { metric: 'repair-count', rows: vehicleRepairRows }
        : { metric: 'open-alerts', rows: vehicleAlertRows };

  const vehicleQuery =
    vehicleMetric === 'maintenance-cost' ? costRows : vehicleMetric === 'repair-count' ? repairRows : ai;

  if (!hasAnyAccess) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          icon={<Trophy className="size-8 text-muted-foreground" aria-hidden="true" />}
          title="You don't have access to this page"
          description="The fleet leaderboard reads AI analytics and maintenance data. Your role holds neither permission."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Fleet Leaderboard"
        description="Where the fleet's alerts, risk and cost are concentrated — by driver, by vehicle and by category."
        breadcrumbs={[{ label: 'Insights' }, { label: 'Fleet Leaderboard' }]}
      />

      <section aria-labelledby="alert-categories">
        <h2 id="alert-categories" className="mb-3 text-h2 text-foreground">
          Alert categories
        </h2>
        <AlertCategoryTiles tiles={tiles} captions={tileCaptions} />
        <p className="mt-3 text-xs text-muted-foreground">
          Tiles marked <span className="font-medium">Endpoint required</span> have no fleet-wide aggregation behind
          them yet. Telematics alerts are readable one vehicle at a time only, so those figures are shown as unknown
          rather than as zero.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <DriverLeaderboardCard
          rows={driverRows}
          metric={driverMetric}
          onMetricChange={setDriverMetric}
          isLoading={ai.isLoading}
          isError={ai.isError}
          error={ai.error}
          hasAccess={canReadAi}
        />

        <VehicleLeaderboardCard
          data={vehicleData}
          onMetricChange={setVehicleMetricChoice}
          isLoading={vehicleQuery.isLoading}
          isError={vehicleQuery.isError}
          error={vehicleQuery.error}
          access={{
            'maintenance-cost': canReadMaintenance,
            'repair-count': canReadMaintenance,
            'open-alerts': canReadAi,
          }}
        />
      </div>
    </div>
  );
}
