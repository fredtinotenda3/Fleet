
// frontend/shared/dashboards/widgets/KPIsWidget.tsx

'use client';

import { Truck, Wrench, Wallet, Fuel as FuelIcon } from 'lucide-react';
import { StatsCard } from '@/shared/ui/cards/StatsCard';
import { formatCurrencyCompact } from '@/shared/utils/currency.utils';
import { useVehicleStatsWidget, useMaintenanceWidget, useExpenseBreakdownWidget, useFuelTrendsWidget } from '@/frontend/modules/dashboard/hooks/useDashboardData';

export function KPIsWidget() {
  const vehicleStats = useVehicleStatsWidget();
  const maintenance = useMaintenanceWidget();
  const expenses = useExpenseBreakdownWidget();
  const fuel = useFuelTrendsWidget();

  const total = vehicleStats.data?.total ?? 0;
  const active = vehicleStats.data?.active ?? 0;
  const activePercent = total > 0 ? Math.round((active / total) * 100) : 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatsCard
        title="Fleet size"
        value={total}
        icon={<Truck className="w-4 h-4" />}
        description={`${active} active (${activePercent}%)`}
        loading={vehicleStats.isLoading}
        color="blue"
      />
      <StatsCard
        title="Open maintenance"
        value={maintenance.data?.overdueCount ?? 0}
        icon={<Wrench className="w-4 h-4" />}
        description={`${maintenance.data?.upcoming.length ?? 0} due soon`}
        loading={maintenance.isLoading}
        color={maintenance.data && maintenance.data.overdueCount > 0 ? 'red' : 'green'}
      />
      <StatsCard
        title="Total expenses"
        value={formatCurrencyCompact(expenses.data?.total ?? 0)}
        icon={<Wallet className="w-4 h-4" />}
        description="All recorded expenses"
        loading={expenses.isLoading}
        color="purple"
      />
      <StatsCard
        title="Fuel spend"
        value={formatCurrencyCompact(fuel.data?.totalCost ?? 0)}
        icon={<FuelIcon className="w-4 h-4" />}
        description={`${Math.round(fuel.data?.totalVolume ?? 0).toLocaleString()} L logged`}
        loading={fuel.isLoading}
        color="yellow"
      />
    </div>
  );
}