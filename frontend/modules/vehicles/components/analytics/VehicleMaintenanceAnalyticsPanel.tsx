// frontend/modules/vehicles/components/analytics/VehicleMaintenanceAnalyticsPanel.tsx
//
// Vehicle-Level Analytics: the "Maintenance" branch of a vehicle's
// Analytics tab. Composes the EXACT SAME components rendered on the
// fleet-wide Maintenance module -- MaintenanceStatsCards and
// MaintenanceCostTrendChart -- the only difference is `licensePlate`
// threaded into each, which narrows the underlying aggregation to this
// one vehicle server-side (same reuse pattern already established by
// VehicleFuelAnalyticsPanel / VehicleExpenseAnalyticsPanel / VehicleTripAnalyticsPanel).
//
// Fleet-only ranking charts (Repair Frequency by Vehicle, Most Expensive
// Vehicles, Downtime Estimate) are intentionally omitted here -- they
// rank vehicles against each other and have no meaning scoped to a
// single vehicle, mirroring how "Vehicle Utilization" was omitted from
// the Trip panel.
//
// VehicleMaintenanceInsightsCards adds the vehicle-specific insights
// called for in the spec (days since last service, average service
// interval, upcoming maintenance prediction, breakdown frequency) --
// these have no fleet-wide equivalent, so they live only here.

'use client';

import {
  MaintenanceStatsCards,
  MaintenanceCostTrendChart,
  VehicleMaintenanceInsightsCards,
} from '@/frontend/modules/maintenance/components';

interface VehicleMaintenanceAnalyticsPanelProps {
  licensePlate: string;
}

export function VehicleMaintenanceAnalyticsPanel({ licensePlate }: VehicleMaintenanceAnalyticsPanelProps) {
  return (
    <div className="space-y-6">
      <MaintenanceStatsCards licensePlate={licensePlate} />

      <VehicleMaintenanceInsightsCards licensePlate={licensePlate} />

      <MaintenanceCostTrendChart licensePlate={licensePlate} />
    </div>
  );
}