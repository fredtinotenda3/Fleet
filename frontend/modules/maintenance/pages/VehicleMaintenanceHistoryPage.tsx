// frontend/modules/maintenance/pages/VehicleMaintenanceHistoryPage.tsx

'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { StatisticCard, StatisticCards } from '@/frontend/shared/ui/data-display/StatisticCards';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { useVehicleMaintenanceHistory } from '../hooks/useMaintenance';
import { useDeleteMaintenanceRecord, useCompleteMaintenanceRecord } from '../hooks/useMaintenanceMutations';
import { MaintenanceTable } from '../components/MaintenanceTable';
import { canManageMaintenance, canDeleteMaintenance, canCompleteMaintenance, formatEstimatedCost } from '../utils';
import { MAINTENANCE_ROUTES } from '../routes';
import type { Reminder } from '../types';

const PAGE_SIZE = 10;

interface VehicleMaintenanceHistoryPageProps {
  licensePlate: string;
}

export function VehicleMaintenanceHistoryPage({ licensePlate }: VehicleMaintenanceHistoryPageProps) {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageMaintenance(roles);
  const canDelete = canDeleteMaintenance(roles);
  const canComplete = canCompleteMaintenance(roles);

  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { data: result, isLoading } = useVehicleMaintenanceHistory(licensePlate, page, PAGE_SIZE);
  const deleteRecord = useDeleteMaintenanceRecord();
  const completeRecord = useCompleteMaintenanceRecord();

  const summary = useMemo(() => {
    const records = result?.data ?? [];
    return {
      total: records.length,
      completed: records.filter((r) => r.status === 'completed').length,
      totalCost: records.reduce((sum, r) => sum + (r.estimated_cost ?? 0), 0),
    };
  }, [result]);

  async function handleDelete(record: Reminder) {
    if (!window.confirm(`Delete the maintenance record "${record.title}"?`)) return;
    await deleteRecord.mutateAsync(record._id);
  }

  async function handleComplete(record: Reminder) {
    await completeRecord.mutateAsync({ id: record._id });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Service history — ${licensePlate}`}
        description="Complete maintenance timeline for this vehicle."
        breadcrumbs={[
          { label: 'Maintenance', href: MAINTENANCE_ROUTES.dashboard },
          { label: 'Records', href: MAINTENANCE_ROUTES.list },
          { label: licensePlate },
        ]}
      />

      {isLoading ? (
        <LoadingState type="stats" />
      ) : (
        <StatisticCards>
          <StatisticCard title="Total records" value={summary.total} />
          <StatisticCard title="Completed" value={summary.completed} />
          <StatisticCard title="Estimated total cost" value={formatEstimatedCost(summary.totalCost)} />
        </StatisticCards>
      )}

      <div className="p-4 space-y-4 surface-card">
        <MaintenanceTable
          result={result}
          isLoading={isLoading}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          selectedIds={selectedIds}
          onToggleSelect={(id) =>
            setSelectedIds((prev) => {
              const next = new Set(prev);
              next.has(id) ? next.delete(id) : next.add(id);
              return next;
            })
          }
          onToggleSelectAll={(ids) => setSelectedIds(new Set(ids))}
          onView={(record) => router.push(MAINTENANCE_ROUTES.detail(record._id))}
          onEdit={(record) => router.push(MAINTENANCE_ROUTES.edit(record._id))}
          onDelete={handleDelete}
          onComplete={handleComplete}
          canManage={canManage}
          canDelete={canDelete}
          canComplete={canComplete}
        />
      </div>
    </div>
  );
}