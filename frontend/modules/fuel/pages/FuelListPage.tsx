// frontend/modules/fuel/pages/FuelListPage.tsx

'use client';

import { useMemo, useState } from 'react';
import { Plus, Download, FileSpreadsheet, Trash2, Printer, Upload } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/frontend/shared/ui/navigation/NestedMenu';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { FuelStatsCards } from '../components/FuelStatsCards';
import { FuelFilters } from '../components/FuelFilters';
import { FuelTable } from '../components/FuelTable';
import { FuelModal, type FuelModalMode } from '../components/FuelModal';
import { FuelImportModal } from '../components/FuelImportModal';
import { useFuelLogsList } from '../hooks/useFuel';
import { useCreateFuelLog, useUpdateFuelLog, useDeleteFuelLog, useBulkDeleteFuelLogs } from '../hooks/useFuelMutations';
import { exportFuelLogsToCSV, exportFuelLogsToExcel, printFuelLogs, canManageFuel, canDeleteFuel } from '../utils';
import { FUEL_ROUTES } from '../routes';
import type { FuelLog, FuelTableFilters } from '../types';
import type { FuelFormValues } from '../schemas';

const PAGE_SIZE = 10;

export function FuelListPage() {
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageFuel(roles);
  const canDelete = canDeleteFuel(roles);

  const [filters, setFilters] = useState<FuelTableFilters>({});
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modalMode, setModalMode] = useState<FuelModalMode>('create');
  const [modalOpen, setModalOpen] = useState(false);
  const [activeLog, setActiveLog] = useState<FuelLog | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const listParams = useMemo(() => ({ ...filters, page, limit: PAGE_SIZE }), [filters, page]);
  const { data: result, isLoading } = useFuelLogsList(listParams);

  const createFuelLog = useCreateFuelLog();
  const updateFuelLogMutation = useUpdateFuelLog(activeLog?._id ?? '');
  const deleteFuelLog = useDeleteFuelLog();
  const bulkDeleteFuelLogs = useBulkDeleteFuelLogs();

  function handleFiltersChange(next: FuelTableFilters) {
    setFilters(next);
    setPage(1);
  }

  function openCreate() {
    setModalMode('create');
    setActiveLog(null);
    setModalOpen(true);
  }

  function openView(log: FuelLog) {
    setModalMode('view');
    setActiveLog(log);
    setModalOpen(true);
  }

  function openEdit(log: FuelLog) {
    setModalMode('edit');
    setActiveLog(log);
    setModalOpen(true);
  }

  async function handleSubmit(values: FuelFormValues) {
    if (modalMode === 'edit' && activeLog?._id) {
      await updateFuelLogMutation.mutateAsync(values);
    } else if (modalMode === 'create') {
      await createFuelLog.mutateAsync(values);
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

  async function handleDelete(log: FuelLog) {
    if (!log._id) return;
    if (!window.confirm(`Delete this fuel entry for ${log.license_plate}?`)) return;
    await deleteFuelLog.mutateAsync({ id: log._id, soft: true });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(log._id!);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected fuel entr${selectedIds.size === 1 ? 'y' : 'ies'}?`)) return;
    await bulkDeleteFuelLogs.mutateAsync(Array.from(selectedIds));
    setSelectedIds(new Set());
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fuel logs"
        description="Every recorded fuel purchase across your fleet."
        breadcrumbs={[{ label: 'Fuel', href: FUEL_ROUTES.dashboard }, { label: 'Logs' }]}
        actions={
          <div className="flex items-center gap-2">
            {canDelete && selectedIds.size > 0 && (
              <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                <Trash2 className="h-3.5 w-3.5" /> Delete ({selectedIds.size})
              </Button>
            )}
            {canManage && (
              <Button variant="outline" size="sm" onClick={() => setImportModalOpen(true)}>
                <Upload className="h-3.5 w-3.5" /> Import
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5" /> Export</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => exportFuelLogsToCSV(result?.data ?? [])}>Export as CSV</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void exportFuelLogsToExcel(result?.data ?? [])}>
                  <FileSpreadsheet className="mr-2 h-3.5 w-3.5" /> Export as Excel
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => printFuelLogs()}>
                  <Printer className="mr-2 h-3.5 w-3.5" /> Print
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {canManage && (
              <Button size="sm" onClick={openCreate}><Plus className="h-3.5 w-3.5" /> Log fuel entry</Button>
            )}
          </div>
        }
      />

      <FuelStatsCards />

      <div className="p-4 space-y-4 surface-card">
        <FuelFilters filters={filters} onChange={handleFiltersChange} />
        <FuelTable
          result={result}
          isLoading={isLoading}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onView={openView}
          onEdit={openEdit}
          onDelete={handleDelete}
          canManage={canManage}
          canDelete={canDelete}
        />
      </div>

      <FuelModal open={modalOpen} mode={modalMode} fuelLog={activeLog} onOpenChange={setModalOpen} onSubmit={handleSubmit} />
      <FuelImportModal open={importModalOpen} onOpenChange={setImportModalOpen} />
    </div>
  );
}