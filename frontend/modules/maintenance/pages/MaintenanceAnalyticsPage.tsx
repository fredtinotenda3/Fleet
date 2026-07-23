//frontend/modules/maintenance/pages/MaintenanceAnalyticsPage.tsx

'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import {
  MaintenanceCostTrendChart,
  RepairFrequencyByVehicleChart,
  MostExpensiveVehiclesChart,
  DowntimeEstimateChart,
} from '../components';
import { MAINTENANCE_ROUTES } from '../routes';

export function MaintenanceAnalyticsPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Maintenance analytics"
        description="Cost trends, repair frequency, and downtime signals across your fleet."
        breadcrumbs={[{ label: 'Maintenance', href: MAINTENANCE_ROUTES.dashboard }, { label: 'Analytics' }]}
        actions={
          <Button variant="outline" size="sm" onClick={() => router.push(MAINTENANCE_ROUTES.dashboard)}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to maintenance
          </Button>
        }
      />

      <MaintenanceCostTrendChart />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RepairFrequencyByVehicleChart />
        <MostExpensiveVehiclesChart />
      </div>

      <DowntimeEstimateChart />
    </div>
  );
}