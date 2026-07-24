//frontend/modules/trips/pages/TripAnalyticsPage.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import {
  TripKpiCards,
  TripAnalyticsFilterBar,
  type TripAnalyticsDateRange,
  TripMonthlyTrendChart,
  VehicleUtilizationChart,
  DriverUtilizationChart,
  TripDistanceDistributionChart,
  TripDayOfWeekHeatmapChart,
  TripTransactionDrawer,
} from '../components';
import { useTripDrawer } from '../hooks/useTripDrawer';
import { TRIP_ROUTES } from '../routes';

export function TripAnalyticsPage() {
  const router = useRouter();
  const [dateRange, setDateRange] = useState<TripAnalyticsDateRange>({});
  const { open, setOpen, filter, openDrawer } = useTripDrawer();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trip analytics"
        description="Enterprise trip insights -- utilization, distance patterns, and operational trends."
        breadcrumbs={[{ label: 'Trips', href: TRIP_ROUTES.list }, { label: 'Analytics' }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => router.push(TRIP_ROUTES.list)}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to trips
          </Button>
        }
      />

      <TripAnalyticsFilterBar value={dateRange} onChange={setDateRange} />

      <TripKpiCards />

      <TripMonthlyTrendChart />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <VehicleUtilizationChart dateRange={dateRange} onDrillDown={openDrawer} />
        <DriverUtilizationChart dateRange={dateRange} onDrillDown={openDrawer} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TripDistanceDistributionChart dateRange={dateRange} />
        <TripDayOfWeekHeatmapChart dateRange={dateRange} />
      </div>

      <TripTransactionDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </div>
  );
}
