//frontend/modules/vehicles/pages/VehiclesListPage.tsx

'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Download, FileSpreadsheet, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/frontend/shared/ui/navigation/NestedMenu';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { VehicleStatsCards } from '../components/VehicleStatsCards';
import { VehicleFilters } from '../components/VehicleFilters';
import { VehiclesTable } from '../components/VehiclesTable';
import { VehicleModal, type VehicleModalMode } from '../components/VehicleModal';
import { useVehiclesList } from '../hooks/useVehicles';
import {
  useCreateVehicle,
  useUpdateVehicle,
  useDeleteVehicle,
  useBulkDeleteVehicles,
  useUpdateVehicleStatus,
} from '../hooks/useVehicleMutations';
import { exportVehicles, canManageVehicles, canDeleteVehicles } from '../utils';
import { VEHICLE_ROUTES } from '../routes';
import type { Vehicle, VehicleStatus, VehicleTableFilters } from '../types';
import type { VehicleFormValues } from '../schemas';

const PAGE_SIZE = 10;

export function VehiclesListPage() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageVehicles(roles);
  const canDelete = canDeleteVehicles(roles);

  const [filters, setFilters] = useState<VehicleTableFilters>({});
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modalMode, setModalMode] = useState<VehicleModalMode>('create');
  const [modalOpen, setModalOpen] = useState(false);
  const [activeVehicle, setActiveVehicle] = useState<Vehicle | null>(null);

  const listParams = useMemo(() => ({ ...filters, page, limit: PAGE_SIZE }), [filters, page]);
  const { data: result, isLoading } = useVehiclesList(listParams);

  const createVehicle = useCreateVehicle();
  const updateVehicleMutation = useUpdateVehicle(activeVehicle?._id ?? '');
  const deleteVehicle = useDeleteVehicle();
  const bulkDeleteVehicles = useBulkDeleteVehicles();
  const updateStatus = useUpdateVehicleStatus();

  function handleFiltersChange(next: VehicleTableFilters) {
    setFilters(next);
    setPage(1);
  }

  function openCreate() {
    setModalMode('create');
    setActiveVehicle(null);
    setModalOpen(true);
  }

  function openEdit(vehicle: Vehicle) {
    setModalMode('edit');
    setActiveVehicle(vehicle);
    setModalOpen(true);
  }

  function openDuplicate(vehicle: Vehicle) {
    setModalMode('duplicate');
    setActiveVehicle(vehicle);
    setModalOpen(true);
  }

  async function handleSubmit(values: VehicleFormValues) {
    if (modalMode === 'edit' && activeVehicle?._id) {
      await updateVehicleMutation.mutateAsync(values);
    } else {
      await createVehicle.mutateAsync(values);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(ids: string[]) {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...ids]);
    });
  }

  async function handleDelete(vehicle: Vehicle) {
    if (!vehicle._id) return;
    if (!window.confirm(`Delete ${vehicle.license_plate}?`)) return;
    await deleteVehicle.mutateAsync({ id: vehicle._id, soft: true });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(vehicle._id!);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected vehicle(s)?`)) return;
    await bulkDeleteVehicles.mutateAsync(Array.from(selectedIds));
    setSelectedIds(new Set());
  }

  async function handleStatusChange(vehicle: Vehicle, status: VehicleStatus) {
    if (!vehicle._id) return;
    await updateStatus.mutateAsync({ id: vehicle._id, status });
  }

  async function handleExport(format: 'csv' | 'xlsx') {
    try {
      const { truncated, totalMatched, rowsExported } = await exportVehicles(filters, format);
      if (truncated) {
        toast.warning(
          `Export limited to ${rowsExported.toLocaleString()} of ${totalMatched.toLocaleString()} matching vehicles. Narrow your filters to export the rest.`
        );
      } else {
        toast.success(`Exported ${rowsExported.toLocaleString()} vehicle${rowsExported === 1 ? '' : 's'}`);
      }
    } catch {
      toast.error('Failed to export vehicles');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vehicles"
        description="Manage your fleet's vehicles, specifications, and status."
        actions={
          <div className="flex items-center gap-2">
            {canDelete && selectedIds.size > 0 && (
              <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete ({selectedIds.size})
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void handleExport('csv')}>
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleExport('xlsx')}>
                  <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
                  Export as Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {canManage && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" />
                Add vehicle
              </Button>
            )}
          </div>
        }
      />

      <VehicleStatsCards />

      <div className="p-4 space-y-4 surface-card">
        <VehicleFilters filters={filters} onChange={handleFiltersChange} />
        <VehiclesTable
          result={result}
          isLoading={isLoading}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onView={(vehicle) => router.push(VEHICLE_ROUTES.detail(vehicle._id!))}
          onEdit={openEdit}
          onDuplicate={openDuplicate}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
          canManage={canManage}
          canDelete={canDelete}
        />
      </div>

      <VehicleModal open={modalOpen} mode={modalMode} vehicle={activeVehicle} onOpenChange={setModalOpen} onSubmit={handleSubmit} />
    </div>
  );
}