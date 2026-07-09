// frontend/modules/fuel/pages/VehicleFuelHistoryPage.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { useVehicleFuelHistory } from '../hooks/useFuel';
import { useCreateFuelLog } from '../hooks/useFuelMutations';
import { FuelTable } from '../components/FuelTable';
import { FuelModal, type FuelModalMode } from '../components/FuelModal';
import { canManageFuel, canDeleteFuel } from '../utils';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { FUEL_ROUTES } from '../routes';
import type { FuelLog } from '../types';
import type { FuelFormValues } from '../schemas';

interface VehicleFuelHistoryPageProps {
  licensePlate: string;
}

export function VehicleFuelHistoryPage({ licensePlate }: VehicleFuelHistoryPageProps) {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageFuel(roles);
  const canDelete = canDeleteFuel(roles);

  const { data: result, isLoading } = useVehicleFuelHistory(licensePlate, 200);
  const createFuelLog = useCreateFuelLog();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const modalMode: FuelModalMode = 'create';

  const logs = result?.data ?? [];
  const totalFuel = logs.reduce((sum, l) => sum + l.fuel_volume, 0);
  const totalCost = logs.reduce((sum, l) => sum + l.cost, 0);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(ids: string[]) {
    setSelectedIds((prev) => (ids.every((id) => prev.has(id)) ? new Set() : new Set(ids)));
  }

  async function handleSubmit(values: FuelFormValues) {
    await createFuelLog.mutateAsync({ ...values, license_plate: licensePlate });
  }

  const breadcrumbs = [{ label: 'Fuel', href: FUEL_ROUTES.dashboard }, { label: licensePlate }];
  const backButton = (
    <Button variant="outline" size="sm" onClick={() => router.push(FUEL_ROUTES.list)}>
      <ArrowLeft className="h-3.5 w-3.5" /> Back
    </Button>
  );

  if (!isLoading && logs.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={`Fuel history · ${licensePlate}`} breadcrumbs={breadcrumbs} actions={backButton} />
        <EmptyState title="No fuel history" description={`No fuel entries recorded for ${licensePlate} yet.`} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Fuel history · ${licensePlate}`}
        description={`${logs.length} entries · ${totalFuel.toFixed(1)} L · ${formatCurrency(totalCost)} total`}
        breadcrumbs={breadcrumbs}
        actions={
          <div className="flex items-center gap-2">
            {backButton}
            {canManage && (
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Log fuel entry
              </Button>
            )}
          </div>
        }
      />

      <div className="p-4 surface-card">
        <FuelTable
          result={result}
          isLoading={isLoading}
          pageSize={200}
          onPageChange={() => {}}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onView={(log: FuelLog) => router.push(FUEL_ROUTES.detail(log._id!))}
          onEdit={(log: FuelLog) => router.push(FUEL_ROUTES.edit(log._id!))}
          onDelete={() => {}}
          canManage={canManage}
          canDelete={canDelete}
        />
      </div>

      <FuelModal open={modalOpen} mode={modalMode} onOpenChange={setModalOpen} onSubmit={handleSubmit} />
    </div>
  );
}