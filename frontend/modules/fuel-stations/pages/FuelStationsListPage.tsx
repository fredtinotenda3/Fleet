// frontend/modules/fuel-stations/pages/FuelStationsListPage.tsx

'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { useFuelStationsList } from '../hooks/useFuelStations';
import { useCreateFuelStation, useUpdateFuelStation, useDeleteFuelStation } from '../hooks/useFuelStationMutations';
import { FuelStationsTable, FuelStationModal, type FuelStationModalMode } from '../components';
import { canManageFuel } from '@/frontend/modules/fuel/utils';
import { FUEL_ROUTES } from '@/frontend/modules/fuel/routes';
import type { FuelStation } from '../types';
import type { FuelStationFormValues } from '../schemas';

export function FuelStationsListPage() {
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageFuel(roles);

  const { data: result, isLoading } = useFuelStationsList();
  const createStation = useCreateFuelStation();
  const [activeStation, setActiveStation] = useState<FuelStation | null>(null);
  const [modalMode, setModalMode] = useState<FuelStationModalMode>('create');
  const [modalOpen, setModalOpen] = useState(false);
  const updateStation = useUpdateFuelStation(activeStation?._id ?? '');
  const deleteStation = useDeleteFuelStation();

  function openCreate() {
    setModalMode('create');
    setActiveStation(null);
    setModalOpen(true);
  }

  function openEdit(station: FuelStation) {
    setModalMode('edit');
    setActiveStation(station);
    setModalOpen(true);
  }

  async function handleSubmit(values: FuelStationFormValues) {
    if (modalMode === 'edit' && activeStation?._id) {
      await updateStation.mutateAsync(values);
    } else {
      await createStation.mutateAsync(values);
    }
  }

  async function handleDelete(station: FuelStation) {
    if (!station._id) return;
    if (!window.confirm(`Delete fuel station "${station.name}"?`)) return;
    await deleteStation.mutateAsync({ id: station._id, soft: true });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fuel stations"
        description="Manage the fuel stations your fleet purchases from."
        breadcrumbs={[{ label: 'Fuel', href: FUEL_ROUTES.dashboard }, { label: 'Stations' }]}
        actions={
          canManage ? (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> Add station
            </Button>
          ) : undefined
        }
      />

      <div className="p-4 surface-card">
        <FuelStationsTable
          stations={result?.data ?? []}
          isLoading={isLoading}
          onEdit={openEdit}
          onDelete={handleDelete}
          canManage={canManage}
        />
      </div>

      <FuelStationModal open={modalOpen} mode={modalMode} station={activeStation} onOpenChange={setModalOpen} onSubmit={handleSubmit} />
    </div>
  );
}