// ========================================
// FILE: frontend/modules/trips/pages/TripsListPage.tsx
// ========================================

'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Download, FileSpreadsheet, Trash2, Printer, BarChart3, Upload } from 'lucide-react';
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
import { ImportModal, type ImportColumnDef, type ImportResponse } from '@/frontend/shared/import/ImportModal';
import { TripStatsCards } from '../components/TripStatsCards';
import { TripFilters } from '../components/TripFilters';
import { TripsTable } from '../components/TripsTable';
import { TripModal, type TripModalMode } from '../components/TripModal';
import { useTripsList, tripKeys } from '../hooks/useTrips';
import { useCreateTrip, useUpdateTrip, useDeleteTrip, useBulkDeleteTrips } from '../hooks/useTripMutations';
import { exportTrips, printTrips, canManageTrips, canDeleteTrips } from '../utils';
import { tripsApi } from '../services/trips.api';
import { TRIP_ROUTES } from '../routes';
import type { Trip, TripTableFilters } from '../types';
import type { TripFormValues } from '../schemas';

const PAGE_SIZE = 10;

// Column mapping for the standard trip importer. `key` is matched
// case-insensitively against the uploaded file's header row by
// <ImportModal>, so "License Plate", "license_plate" and "Plate" all
// need to line up with the header the person actually used -- the
// downloadable template below is the source of truth for the exact
// expected header text.
const TRIP_IMPORT_COLUMNS: ImportColumnDef[] = [
  { key: 'date', label: 'Date', required: true, type: 'date', example: '2026-07-22' },
  { key: 'license_plate', label: 'Vehicle', required: true, type: 'string', example: 'AHA2127' },
  { key: 'mode', label: 'Mode', required: false, type: 'string', example: 'distance' },
  { key: 'trip_distance', label: 'Trip distance', required: false, type: 'number', example: '120' },
  { key: 'start_odometer', label: 'Start odometer', required: false, type: 'number', example: '10500' },
  { key: 'end_odometer', label: 'End odometer', required: false, type: 'number', example: '10620' },
  { key: 'unit_id', label: 'Distance unit', required: false, type: 'string', example: 'km' },
  { key: 'driver', label: 'Driver', required: false, type: 'string', example: 'Aga7718-Steelforce' },
  { key: 'start_location', label: 'Start location', required: false, type: 'string', example: 'Bulawayo' },
  { key: 'end_location', label: 'End location', required: false, type: 'string', example: 'Harare' },
  { key: 'notes', label: 'Notes', required: false, type: 'string', example: '' },
];

export function TripsListPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageTrips(roles);
  const canDelete = canDeleteTrips(roles);

  const [filters, setFilters] = useState<TripTableFilters>({});
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modalMode, setModalMode] = useState<TripModalMode>('create');
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const listParams = useMemo(() => ({ ...filters, page, limit: PAGE_SIZE }), [filters, page]);
  const { data: result, isLoading } = useTripsList(listParams);

  const createTrip = useCreateTrip();
  const updateTripMutation = useUpdateTrip(activeTrip?._id ?? '');
  const deleteTrip = useDeleteTrip();
  const bulkDeleteTrips = useBulkDeleteTrips();

  function handleFiltersChange(next: TripTableFilters) {
    setFilters(next);
    setPage(1);
  }

  function openCreate() {
    setModalMode('create');
    setActiveTrip(null);
    setModalOpen(true);
  }

  function openEdit(trip: Trip) {
    setModalMode('edit');
    setActiveTrip(trip);
    setModalOpen(true);
  }

  async function handleSubmit(values: TripFormValues) {
    if (modalMode === 'edit' && activeTrip?._id) {
      await updateTripMutation.mutateAsync(values);
    } else {
      await createTrip.mutateAsync(values as Required<TripFormValues>);
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

  async function handleDelete(trip: Trip) {
    if (!trip._id) return;
    if (!window.confirm(`Delete this trip for ${trip.license_plate}?`)) return;
    await deleteTrip.mutateAsync(trip._id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(trip._id!);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected trip(s)?`)) return;
    await bulkDeleteTrips.mutateAsync(Array.from(selectedIds));
    setSelectedIds(new Set());
  }

  async function handleStandardImport(records: Array<Record<string, unknown>>): Promise<ImportResponse> {
    return tripsApi.importStandard(records);
  }

  function handleImportComplete(response: ImportResponse) {
    if (response.summary.succeeded > 0) {
      queryClient.invalidateQueries({ queryKey: tripKeys.lists() });
      queryClient.invalidateQueries({ queryKey: tripKeys.stats() });
      toast.success(
        `Imported ${response.summary.succeeded} trip${response.summary.succeeded === 1 ? '' : 's'}` +
          (response.summary.failed > 0 ? ` (${response.summary.failed} row(s) failed)` : '')
      );
    } else {
      toast.error('No trips were imported. Check the failed rows below.');
    }
  }

  async function handleExport(format: 'csv' | 'xlsx') {
    try {
      const { truncated, totalMatched, rowsExported } = await exportTrips(filters, format);
      if (truncated) {
        toast.warning(
          `Export limited to ${rowsExported.toLocaleString()} of ${totalMatched.toLocaleString()} matching trips. Narrow your filters to export the rest.`
        );
      } else {
        toast.success(`Exported ${rowsExported.toLocaleString()} trip${rowsExported === 1 ? '' : 's'}`);
      }
    } catch {
      toast.error('Failed to export trips');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trips"
        description="Track vehicle trips, distances, and driver activity across your fleet."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push(TRIP_ROUTES.analytics)}>
              <BarChart3 className="h-3.5 w-3.5" /> Full analytics
            </Button>
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
                <DropdownMenuItem onSelect={() => printTrips()}>
                  <Printer className="mr-2 h-3.5 w-3.5" />
                  Print
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {canManage && (
              <Button variant="outline" size="sm" onClick={() => setImportModalOpen(true)}>
                <Upload className="h-3.5 w-3.5" />
                Import
              </Button>
            )}
            {canManage && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" />
                Log trip
              </Button>
            )}
          </div>
        }
      />

      <TripStatsCards />

      <div className="p-4 space-y-4 surface-card">
        <TripFilters filters={filters} onChange={handleFiltersChange} />
        <TripsTable
          result={result}
          isLoading={isLoading}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onView={(trip) => router.push(TRIP_ROUTES.detail(trip._id!))}
          onEdit={openEdit}
          onDelete={handleDelete}
          canManage={canManage}
          canDelete={canDelete}
        />
      </div>

      <TripModal open={modalOpen} mode={modalMode} trip={activeTrip} onOpenChange={setModalOpen} onSubmit={handleSubmit} />

      <ImportModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        title="Import trips"
        description="Upload a CSV or Excel file with your trip records. Download the template below to see the expected columns."
        columns={TRIP_IMPORT_COLUMNS}
        onImport={handleStandardImport}
        onImportComplete={handleImportComplete}
      />
    </div>
  );
}