// frontend/modules/maintenance/components/VehicleMaintenanceInsightsCards.tsx
//
// Vehicle-Level Analytics: single-vehicle-only derived maintenance
// insights that have no fleet-wide equivalent (unlike MaintenanceStatsCards
// and MaintenanceCostTrendChart above, which are the SAME fleet
// calculation narrowed by licensePlate). These surface the
// "Vehicle-Level Additional Analytics" called for in the spec: days
// since last service, average maintenance interval, upcoming maintenance
// prediction, and breakdown frequency.

'use client';

import { CalendarClock, Gauge, AlertOctagon, Wallet } from 'lucide-react';
import { StatisticCard, StatisticCards } from '@/frontend/shared/ui/data-display/StatisticCards';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { useVehicleMaintenanceInsights } from '../hooks/useMaintenance';
import { formatCurrency } from '@/shared/utils/currency.utils';

interface VehicleMaintenanceInsightsCardsProps {
  licensePlate: string;
}

export function VehicleMaintenanceInsightsCards({ licensePlate }: VehicleMaintenanceInsightsCardsProps) {
  const { data, isLoading } = useVehicleMaintenanceInsights(licensePlate);

  if (isLoading || !data) {
    return <LoadingState type="stats" />;
  }

  return (
    <StatisticCards>
      <StatisticCard
        title="Days since last service"
        value={data.daysSinceLastService != null ? data.daysSinceLastService : 'N/A'}
        icon={<CalendarClock className="w-4 h-4 text-muted-foreground" />}
        description={data.daysSinceLastService != null ? 'Since last completed service' : 'No completed service on record'}
      />
      <StatisticCard
        title="Avg. service interval"
        value={data.averageServiceIntervalDays != null ? `${data.averageServiceIntervalDays}d` : 'N/A'}
        icon={<Gauge className="w-4 h-4 text-muted-foreground" />}
        description={data.averageServiceIntervalDays != null ? 'Between completed services' : 'Needs 2+ completed services'}
      />
      <StatisticCard
        title="Next maintenance due"
        value={data.nextUpcomingReminder ? `${data.nextUpcomingReminder.daysUntilDue}d` : 'None scheduled'}
        icon={<CalendarClock className="w-4 h-4 text-info" />}
        description={data.nextUpcomingReminder ? data.nextUpcomingReminder.title : 'No upcoming maintenance scheduled'}
      />
      <StatisticCard
        title="Breakdown frequency"
        value={data.breakdownFrequency}
        icon={<AlertOctagon className="w-4 h-4 text-danger" />}
        description="Completed emergency repairs"
      />
      <StatisticCard
        title="Total maintenance cost"
        value={formatCurrency(data.totalMaintenanceCost)}
        icon={<Wallet className="w-4 h-4 text-success" />}
        description={`${data.completedRecordCount} completed record${data.completedRecordCount === 1 ? '' : 's'}`}
      />
    </StatisticCards>
  );
}
