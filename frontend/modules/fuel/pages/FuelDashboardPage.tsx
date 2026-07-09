// frontend/modules/fuel/pages/FuelDashboardPage.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, List } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { FuelStatsCards } from '../components/FuelStatsCards';
import { FuelKpiCards } from '../components/FuelKpiCards';
import { AbnormalConsumptionWidget } from '../components/AbnormalConsumptionWidget';
import { FuelMonthlyTrendChart } from '../components/FuelMonthlyTrendChart';
import { FuelTopConsumersChart } from '../components/FuelTopConsumersChart';
import { FuelModal, type FuelModalMode } from '../components/FuelModal';
import { useCreateFuelLog } from '../hooks/useFuelMutations';
import { canManageFuel } from '../utils';
import { FUEL_ROUTES } from '../routes';
import type { FuelFormValues } from '../schemas';

export function FuelDashboardPage() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageFuel(roles);

  const [modalOpen, setModalOpen] = useState(false);
  const modalMode: FuelModalMode = 'create';
  const createFuelLog = useCreateFuelLog();

  async function handleSubmit(values: FuelFormValues) {
    await createFuelLog.mutateAsync(values);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fuel"
        description="Monitor fuel consumption, costs, and efficiency across your fleet."
        breadcrumbs={[{ label: 'Fuel' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push(FUEL_ROUTES.list)}>
              <List className="h-3.5 w-3.5" /> All fuel logs
            </Button>
            {canManage && (
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Log fuel entry
              </Button>
            )}
          </div>
        }
      />

      <FuelStatsCards />
      <FuelKpiCards />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <FuelMonthlyTrendChart />
        <FuelTopConsumersChart />
      </div>

      <AbnormalConsumptionWidget />

      <FuelModal open={modalOpen} mode={modalMode} onOpenChange={setModalOpen} onSubmit={handleSubmit} />
    </div>
  );
}