// frontend/modules/maintenance/pages/MaintenanceDashboardPage.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, List, CalendarDays, AlertTriangle, Clock, BarChart3 } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/frontend/shared/ui/navigation/NestedMenu';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { MaintenanceStatsCards } from '../components/MaintenanceStatsCards';
import { MaintenanceStatusChart, MaintenanceCategoryChart } from '../components/MaintenanceCharts';
import { MaintenanceModal } from '../components/MaintenanceModal';
import { useOverdueMaintenance, useUpcomingMaintenance } from '../hooks/useMaintenance';
import { useCreateMaintenanceRecord } from '../hooks/useMaintenanceMutations';
import { canManageMaintenance } from '../utils';
import { formatDate } from '@/shared/utils/date.utils';
import { MAINTENANCE_ROUTES } from '../routes';
import type { MaintenanceFormValues } from '../schemas';

export function MaintenanceDashboardPage() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageMaintenance(roles);

  const [modalOpen, setModalOpen] = useState(false);
  const createRecord = useCreateMaintenanceRecord();
  const { data: overdue } = useOverdueMaintenance();
  const { data: upcoming } = useUpcomingMaintenance(7);

  async function handleSubmit(values: MaintenanceFormValues) {
    // Cast and transform the date to strictly match the mutation's expected type
    await createRecord.mutateAsync({
      ...values,
      due_date: new Date(values.due_date),
    } as any);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Maintenance"
        description="Track preventive and corrective maintenance across your fleet."
        breadcrumbs={[{ label: 'Maintenance' }]}
        actions={
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">Manage</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => router.push(MAINTENANCE_ROUTES.list)}>
                  <List className="mr-2 h-3.5 w-3.5" /> All records
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push(MAINTENANCE_ROUTES.upcoming)}>
                  <Clock className="mr-2 h-3.5 w-3.5" /> Upcoming
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push(MAINTENANCE_ROUTES.overdue)}>
                  <AlertTriangle className="mr-2 h-3.5 w-3.5" /> Overdue
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push(MAINTENANCE_ROUTES.calendar)}>
                  <CalendarDays className="mr-2 h-3.5 w-3.5" /> Service calendar
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push(MAINTENANCE_ROUTES.analytics)}>
                  <BarChart3 className="mr-2 h-3.5 w-3.5" /> Analytics
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {canManage && (
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                New record
              </Button>
            )}
          </div>
        }
      />

      <MaintenanceStatsCards />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <MaintenanceStatusChart />
        <MaintenanceCategoryChart />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="p-4 space-y-3 surface-card">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="w-4 h-4 text-red-600" /> Overdue ({overdue?.length ?? 0})
            </h3>
            <Button variant="link" size="sm" onClick={() => router.push(MAINTENANCE_ROUTES.overdue)}>
              View all
            </Button>
          </div>
          <div className="space-y-2">
            {(overdue ?? []).slice(0, 5).map((r) => (
              <button
                key={r._id}
                onClick={() => router.push(MAINTENANCE_ROUTES.detail(r._id!))}
                className="flex items-center justify-between w-full px-3 py-2 text-sm text-left border rounded-md hover:bg-muted"
              >
                <span>{r.license_plate} — {r.title}</span>
                <span className="text-xs text-muted-foreground">{formatDate(r.due_date)}</span>
              </button>
            ))}
            {(overdue ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing overdue. Fleet is up to date.</p>
            )}
          </div>
        </div>

        <div className="p-4 space-y-3 surface-card">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="w-4 h-4 text-blue-600" /> Upcoming (next 7 days)
            </h3>
            <Button variant="link" size="sm" onClick={() => router.push(MAINTENANCE_ROUTES.upcoming)}>
              View all
            </Button>
          </div>
          <div className="space-y-2">
            {(upcoming ?? []).slice(0, 5).map((r) => (
              <button
                key={r._id}
                onClick={() => router.push(MAINTENANCE_ROUTES.detail(r._id!))}
                className="flex items-center justify-between w-full px-3 py-2 text-sm text-left border rounded-md hover:bg-muted"
              >
                <span>{r.license_plate} — {r.title}</span>
                <span className="text-xs text-muted-foreground">{formatDate(r.due_date)}</span>
              </button>
            ))}
            {(upcoming ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing scheduled in the next 7 days.</p>
            )}
          </div>
        </div>
      </div>

      <MaintenanceModal open={modalOpen} mode="create" onOpenChange={setModalOpen} onSubmit={handleSubmit} isSubmitting={createRecord.isPending} />
    </div>
  );
}