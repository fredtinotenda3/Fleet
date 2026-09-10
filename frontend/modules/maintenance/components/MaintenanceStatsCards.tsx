// frontend/modules/maintenance/components/MaintenanceStatsCards.tsx

'use client';

import { Wrench, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { StatisticCard, StatisticCards } from '@/frontend/shared/ui/data-display/StatisticCards';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { useMaintenanceStats } from '../hooks/useMaintenance';

interface MaintenanceStatsCardsProps {
  /**
   * Vehicle-Level Analytics: when set, narrows the SAME fleet-wide stats
   * calculation to a single vehicle (SUM(all vehicles) -> SUM(where
   * license_plate == licensePlate)). Omitted on the fleet Maintenance
   * dashboard; passed by VehicleMaintenanceAnalyticsPanel.
   */
  licensePlate?: string;
}

/**
 * FIXED (empty-organisation round). Three defects, all in the empty case:
 *
 *   1. `isError` was never read, and `!stats` fell into the loading
 *      branch -- so a failed request rendered a permanent skeleton
 *      rather than saying anything.
 *   2. "Overdue 0" carried the description "All caught up". An
 *      organisation with no maintenance records has not caught up with
 *      anything.
 *   3. "Completion rate" rendered `0.0%` beside a green tick for a fleet
 *      with nothing to complete -- a figure a manager would act on,
 *      derived entirely from an absence. `completionRate` and
 *      `averageCompletionDays` are now null in exactly that case (see
 *      maintenance.repository.ts) and are rendered as such.
 */
export function MaintenanceStatsCards({ licensePlate }: MaintenanceStatsCardsProps) {
  const { data: stats, isLoading, isError } = useMaintenanceStats(licensePlate);

  if (isLoading) {
    return <LoadingState type="stats" />;
  }

  const hasRecords = (stats?.total ?? 0) > 0;

  return (
    <StatisticCards>
      <StatisticCard
        title="Total records"
        value={stats ? stats.total.toLocaleString() : null}
        icon={<Wrench className="w-4 h-4 text-muted-foreground" />}
        error={isError}
        emptyValue="—"
      />
      <StatisticCard
        title="Pending"
        value={stats ? stats.pending.toLocaleString() : null}
        icon={<Clock className="w-4 h-4 text-info" />}
        error={isError}
        emptyValue="—"
      />
      <StatisticCard
        title="Overdue"
        value={stats ? stats.overdue.toLocaleString() : null}
        icon={<AlertTriangle className="w-4 h-4 text-danger" />}
        error={isError}
        emptyValue="—"
        description={
          !stats
            ? undefined
            : stats.overdue > 0
              ? 'Needs attention'
              : hasRecords
                ? 'All caught up'
                : 'No maintenance recorded yet'
        }
      />
      <StatisticCard
        title="Completion rate"
        value={
          stats && stats.completionRate !== null ? `${stats.completionRate.toFixed(1)}%` : null
        }
        icon={<CheckCircle2 className="w-4 h-4 text-success" />}
        error={isError}
        emptyValue="Not measured"
        description={
          stats && stats.averageCompletionDays !== null
            ? `Avg. ${stats.averageCompletionDays} days to complete`
            : stats
              ? 'Nothing completed yet'
              : undefined
        }
      />
    </StatisticCards>
  );
}
