// frontend/modules/vehicles/components/analytics/VehicleFuelAnalyticsPanel.tsx
//
// Vehicle-Level Analytics: the "Fuel" branch of a vehicle's Analytics tab.
// Composes the EXACT SAME chart components rendered on the fleet-wide
// FuelAnalyticsPage -- the only difference is that `licensePlate` is
// threaded into every hook call, which narrows each chart's underlying
// aggregation to this one vehicle via AnalyticsScope server-side. No
// vehicle-specific analytics implementation exists anywhere in this file;
// this is deliberately a thin composition layer, not a duplicate engine.
//
// Charts that only make sense at fleet scope (top consumers ranking,
// frequency-by-vehicle ranking) are intentionally omitted here -- they
// remain fleet-only on FuelAnalyticsPage.

'use client';

import { useState } from 'react';
import { FuelKpiCards } from '@/frontend/modules/fuel/components/FuelKpiCards';
import { FuelAnalyticsFilterBar, type FuelAnalyticsDateRange } from '@/frontend/modules/fuel/components/FuelAnalyticsFilterBar';
import { VehicleFuelActivityTimelineChart } from '@/frontend/modules/fuel/components/VehicleFuelActivityTimelineChart';
import { FuelActivityTrendChart } from '@/frontend/modules/fuel/components/FuelActivityTrendChart';
import { FuelCostByDriverChart } from '@/frontend/modules/fuel/components/FuelCostByDriverChart';
import { FuelByStationChart } from '@/frontend/modules/fuel/components/FuelByStationChart';
import { AverageFuelPriceTrendChart } from '@/frontend/modules/fuel/components/AverageFuelPriceTrendChart';
import { FuelTypeDistributionChart } from '@/frontend/modules/fuel/components/FuelTypeDistributionChart';
import { FuelCostDistributionChart } from '@/frontend/modules/fuel/components/FuelCostDistributionChart';
import { FuelEntryHeatmapChart } from '@/frontend/modules/fuel/components/FuelEntryHeatmapChart';
import { AbnormalConsumptionWidget } from '@/frontend/modules/fuel/components/AbnormalConsumptionWidget';
import { VehicleFuelReconciliationPanel } from './VehicleFuelReconciliationPanel';

interface VehicleFuelAnalyticsPanelProps {
  licensePlate: string;
  /**
   * WAVE 1 PART 2, item 4: gates `VehicleFuelReconciliationPanel` to a
   * NOT-APPLICABLE state for electric vehicles, which have no fuel logs
   * to reconcile by definition. Resolved once at `VehicleDetailPage` via
   * `vehicleProfileFor(vehicle.vehicle_type, vehicle.fuel_type).isElectric`
   * and threaded down rather than re-derived or re-fetched here.
   */
  isElectric: boolean;
}

export function VehicleFuelAnalyticsPanel({ licensePlate, isElectric }: VehicleFuelAnalyticsPanelProps) {
  const [dateRange, setDateRange] = useState<FuelAnalyticsDateRange>({});

  return (
    <div className="space-y-6">
      <FuelAnalyticsFilterBar value={dateRange} onChange={setDateRange} />

      {/*
        WAVE 1 PART 2, item 5 (FIX): `dateRange` was never threaded into
        this card -- see FuelKpiCards.tsx's `dateRange` prop doc comment.
        Every other chart on this tab already reacted to the filter bar
        above; this was the one silent holdout.
      */}
      <FuelKpiCards licensePlate={licensePlate} dateRange={dateRange} />

      {/*
        WAVE 1 PART 2, item 4: reuses this SAME `dateRange` state rather
        than introducing a second range control -- see
        VehicleFuelReconciliationPanel.tsx's header comment.
      */}
      <VehicleFuelReconciliationPanel
        licensePlate={licensePlate}
        isElectric={isElectric}
        dateRange={dateRange}
      />

      <AbnormalConsumptionWidget licensePlate={licensePlate} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <VehicleFuelActivityTimelineChart dateRange={dateRange} licensePlate={licensePlate} />
        <FuelCostByDriverChart dateRange={dateRange} licensePlate={licensePlate} />
      </div>

      <FuelActivityTrendChart dateRange={dateRange} licensePlate={licensePlate} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <FuelByStationChart dateRange={dateRange} licensePlate={licensePlate} />
        <AverageFuelPriceTrendChart dateRange={dateRange} licensePlate={licensePlate} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <FuelTypeDistributionChart dateRange={dateRange} licensePlate={licensePlate} />
        <FuelCostDistributionChart dateRange={dateRange} licensePlate={licensePlate} />
      </div>

      <FuelEntryHeatmapChart dateRange={dateRange} licensePlate={licensePlate} />
    </div>
  );
}