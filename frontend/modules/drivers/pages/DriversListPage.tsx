// frontend/modules/drivers/pages/DriversListPage.tsx

'use client';

import { useMemo, useState } from 'react';
import { Plus, Search, AlertCircle } from 'lucide-react';
import { useDebounce } from 'use-debounce';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Input } from '@/frontend/shared/ui/forms/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/frontend/shared/ui/forms/select';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { useDriversList } from '../hooks/useDrivers';
import {
  useCreateDriver,
  useUpdateDriver,
  useDeleteDriver,
} from '../hooks/useDriverMutations';
import { DriversTable, DriverModal, type DriverModalMode } from '../components';
import { canManageDrivers, canDeleteDrivers } from '../utils';
import type { Driver, DriverStatus } from '../types';
import type { DriverFormValues } from '../schemas';

const ALL_STATUSES = '__all__';

export function DriversListPage() {
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageDrivers(roles);
  const canDelete = canDeleteDrivers(roles);

  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 300);
  const [status, setStatus] = useState<string>(ALL_STATUSES);

  const params = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      status: status === ALL_STATUSES ? undefined : (status as DriverStatus),
    }),
    [debouncedSearch, status]
  );

  const { data: result, isLoading, isError, error, refetch } = useDriversList(params);

  const [activeDriver, setActiveDriver] = useState<Driver | null>(null);
  const [modalMode, setModalMode] = useState<DriverModalMode>('create');
  const [modalOpen, setModalOpen] = useState(false);

  const createDriver = useCreateDriver();
  const updateDriver = useUpdateDriver(activeDriver?._id ?? '');
  const deleteDriver = useDeleteDriver();

  const drivers = result?.data ?? [];
  const isFiltered = Boolean(params.search || params.status);

  function openCreate() {
    setModalMode('create');
    setActiveDriver(null);
    setModalOpen(true);
  }

  function openEdit(driver: Driver) {
    setModalMode('edit');
    setActiveDriver(driver);
    setModalOpen(true);
  }

  async function handleSubmit(values: DriverFormValues) {
    if (modalMode === 'edit' && activeDriver?._id) {
      await updateDriver.mutateAsync(values);
    } else {
      await createDriver.mutateAsync(values);
    }
  }

  async function handleDelete(driver: Driver) {
    if (!driver._id) return;
    if (!canDelete) return;
    if (
      !window.confirm(
        `Delete driver "${driver.name}"? Their historical trips and fuel logs are kept.`
      )
    ) {
      return;
    }
    await deleteDriver.mutateAsync({ id: driver._id, soft: true });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Drivers"
        description="Manage the drivers assigned to trips, fuel logs and work orders."
        breadcrumbs={[{ label: 'Drivers' }]}
        actions={
          canManage ? (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" /> Add driver
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-4 p-4 surface-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, code or licence number"
              aria-label="Search drivers"
              className="pl-8"
            />
          </div>

          <Select value={status} onValueChange={(value) => setStatus(value ?? ALL_STATUSES)}>
            <SelectTrigger className="sm:w-44" aria-label="Filter by status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isError ? (
          <div
            role="alert"
            className="flex flex-col items-center gap-3 rounded-md border border-destructive/40 p-8 text-center"
          >
            <AlertCircle className="h-6 w-6 text-destructive" />
            <div>
              <p className="font-medium">Couldn&apos;t load drivers</p>
              <p className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : 'An unexpected error occurred.'}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            <DriversTable
              drivers={drivers}
              isLoading={isLoading}
              onEdit={openEdit}
              onDelete={handleDelete}
              canManage={canManage}
            />

            {!isLoading && drivers.length === 0 && isFiltered ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No drivers match those filters.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setStatus(ALL_STATUSES);
                  }}
                >
                  Clear filters
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <DriverModal
        open={modalOpen}
        mode={modalMode}
        driver={activeDriver}
        onOpenChange={setModalOpen}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

export default DriversListPage;
