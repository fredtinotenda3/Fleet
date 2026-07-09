// frontend/modules/maintenance/pages/MaintenanceListPage.tsx

'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Download, FileSpreadsheet, Trash2, Printer } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/frontend/shared/ui/navigation/NestedMenu';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { MaintenanceFilters } from '../components/MaintenanceFilters';
import { MaintenanceTable } from '../components/MaintenanceTable';
import { MaintenanceModal, type MaintenanceModalMode } from '../components/MaintenanceModal';
import { useMaintenanceList } from '../hooks/useMaintenance';
import {
  useCreateMaintenanceRecord,
  useUpdateMaintenanceRecord,
  useDeleteMaintenanceRecord,
  useBulkDeleteMaintenanceRecords,
  useCompleteMaintenanceRecord,
} from '../hooks/useMaintenanceMutations';
import {
  exportMaintenanceToCSV,
  exportMaintenanceToExcel,
  printMaintenanceRecords,
  canManageMaintenance,
  canDeleteMaintenance,
  canCompleteMaintenance,
} from '../utils';
import { MAINTENANCE_ROUTES } from '../routes';
import type { Reminder, MaintenanceTableFilters } from '../types';
import type { MaintenanceFormValues } from '../schemas';

const PAGE_SIZE = 10;

export function MaintenanceListPage() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageMaintenance(roles);
  const canDelete = canDeleteMaintenance(roles);
  const canComplete = canCompleteMaintenance(roles);

  const [filters, setFilters] = useState<MaintenanceTableFilters>({});
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modalMode, setModalMode] = useState<MaintenanceModalMode>('create');
  const [modalOpen, setModalOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState<Reminder | null>(null);

  const listParams = useMemo(() => ({ ...filters, page, limit: PAGE_SIZE }), [filters, page]);
  const { data: result, isLoading } = useMaintenanceList(listParams);

  const createRecord = useCreateMaintenanceRecord();
  const updateRecord = useUpdateMaintenanceRecord(activeRecord?._id ?? '');
  const deleteRecord = useDeleteMaintenanceRecord();
  const bulkDeleteRecords = useBulkDeleteMaintenanceRecords();
  const completeRecord = useCompleteMaintenanceRecord();

  function handleFiltersChange(next: MaintenanceTableFilters) {
    setFilters(next);
    setPage(1);
  }

  function openCreate() {
    setModalMode('create');
    setActiveRecord(null);
    setModalOpen(true);
  }

  function openEdit(record: Reminder) {
    setModalMode('edit');
    setActiveRecord(record);
    setModalOpen(true);
  }

  async function handleSubmit(values: MaintenanceFormValues) {
    if (modalMode === 'edit' && activeRecord?._id) {
      await updateRecord.mutateAsync(values);
    } else {
      await createRecord.mutateAsync(values as Required<MaintenanceFormValues>);
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

  async function handleDelete(record: Reminder) {
    if (!window.confirm(`Delete the maintenance record "${record.title}" for ${record.license_plate}?`)) return;
    await deleteRecord.mutateAsync(record._id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(record._id);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected record${selectedIds.size === 1 ? '' : 's'}?`)) return;
    await bulkDeleteRecords.mutateAsync(Array.from(selectedIds));
    setSelectedIds(new Set());
  }

  async function handleComplete(record: Reminder) {
    await completeRecord.mutateAsync({ id: record._id });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Maintenance records"
        description="Every scheduled, completed, and overdue service across your fleet."
        breadcrumbs={[{ label: 'Maintenance', href: MAINTENANCE_ROUTES.dashboard }, { label: 'Records' }]}
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
                <DropdownMenuItem onSelect={() => exportMaintenanceToCSV(result?.data ?? [])}>
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void exportMaintenanceToExcel(result?.data ?? [])}>
                  <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
                  Export as Excel
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => printMaintenanceRecords()}>
                  <Printer className="mr-2 h-3.5 w-3.5" />
                  Print
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {canManage && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" />
                New record
              </Button>
            )}
          </div>
        }
      />

      <div className="p-4 space-y-4 surface-card">
        <MaintenanceFilters filters={filters} onChange={handleFiltersChange} />
        <MaintenanceTable
          result={result}
          isLoading={isLoading}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onView={(record) => router.push(MAINTENANCE_ROUTES.detail(record._id))}
          onEdit={openEdit}
          onDelete={handleDelete}
          onComplete={handleComplete}
          canManage={canManage}
          canDelete={canDelete}
          canComplete={canComplete}
        />
      </div>

      <MaintenanceModal
        open={modalOpen}
        mode={modalMode}
        record={activeRecord}
        onOpenChange={setModalOpen}
        onSubmit={handleSubmit}
        isSubmitting={createRecord.isPending || updateRecord.isPending}
      />
    </div>
  );
}