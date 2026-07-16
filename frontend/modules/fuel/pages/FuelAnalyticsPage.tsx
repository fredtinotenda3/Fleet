// frontend/modules/fuel/pages/FuelAnalyticsPage.tsx

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import {
  FuelAnalyticsFilterBar,
  type FuelAnalyticsDateRange,
  VehicleFuelActivityTimelineChart,
  FuelCostByDriverChart,
  FuelActivityTrendChart,
  FuelByStationChart,
  AverageFuelPriceTrendChart,
  FuelTypeDistributionChart,
  FuelFrequencyByVehicleChart,
  FuelCostDistributionChart,
  FuelEntryHeatmapChart,
} from '../components';
import { FUEL_ROUTES } from '../routes';

export function FuelAnalyticsPage() {
  const router = useRouter();
  const [dateRange, setDateRange] = useState<FuelAnalyticsDateRange>({});

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fuel analytics"
        description="Enterprise fuel insights -- fleet-wide trends, cost drivers, and anomaly signals."
        breadcrumbs={[{ label: 'Fuel', href: FUEL_ROUTES.dashboard }, { label: 'Analytics' }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => router.push(FUEL_ROUTES.dashboard)}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to fuel
          </Button>
        }
      />

      <FuelAnalyticsFilterBar value={dateRange} onChange={setDateRange} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <VehicleFuelActivityTimelineChart dateRange={dateRange} />
        <FuelCostByDriverChart dateRange={dateRange} />
      </div>

      <FuelActivityTrendChart dateRange={dateRange} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <FuelByStationChart dateRange={dateRange} />
        <AverageFuelPriceTrendChart dateRange={dateRange} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <FuelTypeDistributionChart dateRange={dateRange} />
        <FuelFrequencyByVehicleChart dateRange={dateRange} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <FuelCostDistributionChart dateRange={dateRange} />
        <FuelEntryHeatmapChart dateRange={dateRange} />
      </div>
    </div>
  );
}