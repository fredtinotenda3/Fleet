// frontend/modules/vehicles/components/analytics/VehicleTripAnalyticsPanel.tsx
//
// Vehicle-scoped Trip analytics, reusing the exact same components as
// the fleet-wide Trip Analytics page (TripKpiCards, TripMonthlyTrendChart,
// DriverUtilizationChart, TripDistanceDistributionChart,
// TripDayOfWeekHeatmapChart, TripCostAnalyticsChart) -- the only
// difference is `licensePlate` being passed down, exactly the pattern
// already established by VehicleFuelAnalyticsPanel / VehicleExpenseAnalyticsPanel.
//
// "Vehicle Utilization" (fleet-wide ranking of vehicles) is intentionally
// omitted here -- it has no meaning scoped to a single vehicle.
//
// Clicking a bar on Driver Utilization opens the same
// TripTransactionDrawer used on the fleet Analytics page, pre-scoped to
// this vehicle, with the same CSV / Excel / print export options.

'use client';

import {
  TripKpiCards,
  TripAnalyticsFilterBar,
  type TripAnalyticsDateRange,
  TripMonthlyTrendChart,
  DriverUtilizationChart,
  TripDistanceDistributionChart,
  TripDayOfWeekHeatmapChart,
  TripCostAnalyticsChart,
  TripTransactionDrawer,
} from '@/frontend/modules/trips/components';
import { useTripDrawer } from '@/frontend/modules/trips/hooks/useTripDrawer';
import { useState } from 'react';

interface VehicleTripAnalyticsPanelProps {
  licensePlate: string;
}

export function VehicleTripAnalyticsPanel({ licensePlate }: VehicleTripAnalyticsPanelProps) {
  const [dateRange, setDateRange] = useState<TripAnalyticsDateRange>({});
  const { open, setOpen, filter, openDrawer } = useTripDrawer();

  return (
    <div className="space-y-6">
      <TripAnalyticsFilterBar value={dateRange} onChange={setDateRange} />

      <TripKpiCards dateRange={dateRange} licensePlate={licensePlate} />

      <TripMonthlyTrendChart licensePlate={licensePlate} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <DriverUtilizationChart
          dateRange={dateRange}
          licensePlate={licensePlate}
          onDrillDown={openDrawer}
        />
        <TripDistanceDistributionChart dateRange={dateRange} licensePlate={licensePlate} />
      </div>

      <TripDayOfWeekHeatmapChart dateRange={dateRange} licensePlate={licensePlate} />

      <TripCostAnalyticsChart dateRange={dateRange} licensePlate={licensePlate} />

      <TripTransactionDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </div>
  );
}