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

export function MaintenanceStatsCards({ licensePlate }: MaintenanceStatsCardsProps) {
  const { data: stats, isLoading } = useMaintenanceStats(licensePlate);

  if (isLoading || !stats) {
    return <LoadingState type="stats" />;
  }

  return (
    <StatisticCards>
      <StatisticCard title="Total records" value={stats.total} icon={<Wrench className="w-4 h-4 text-muted-foreground" />} />
      <StatisticCard
        title="Pending"
        value={stats.pending}
        icon={<Clock className="w-4 h-4 text-blue-600" />}
      />
      <StatisticCard
        title="Overdue"
        value={stats.overdue}
        icon={<AlertTriangle className="w-4 h-4 text-red-600" />}
        description={stats.overdue > 0 ? 'Needs attention' : 'All caught up'}
      />
      <StatisticCard
        title="Completion rate"
        value={`${stats.completionRate.toFixed(1)}%`}
        icon={<CheckCircle2 className="w-4 h-4 text-green-600" />}
        description={`Avg. ${stats.averageCompletionDays} days to complete`}
      />
    </StatisticCards>
  );
}
