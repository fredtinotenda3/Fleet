// frontend/modules/maintenance/pages/MaintenanceDetailPage.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { useMaintenanceRecord } from '../hooks/useMaintenance';
import { useUpdateMaintenanceRecord, useDeleteMaintenanceRecord, useCompleteMaintenanceRecord } from '../hooks/useMaintenanceMutations';
import { MaintenanceModal } from '../components/MaintenanceModal';
import {
  STATUS_BADGE_CLASSES,
  PRIORITY_BADGE_CLASSES,
  getStatusLabel,
  getPriorityLabel,
  formatEstimatedCost,
  isRecordOverdue,
  canManageMaintenance,
  canDeleteMaintenance,
  canCompleteMaintenance,
} from '../utils';
import { formatDate } from '@/shared/utils/date.utils';
import { MAINTENANCE_ROUTES } from '../routes';
import type { MaintenanceFormValues } from '../schemas';

interface MaintenanceDetailPageProps {
  id: string;
}

export function MaintenanceDetailPage({ id }: MaintenanceDetailPageProps) {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canManage = canManageMaintenance(roles);
  const canDelete = canDeleteMaintenance(roles);
  const canComplete = canCompleteMaintenance(roles);

  const { data: record, isLoading } = useMaintenanceRecord(id);
  const updateRecord = useUpdateMaintenanceRecord(id);
  const deleteRecord = useDeleteMaintenanceRecord();
  const completeRecord = useCompleteMaintenanceRecord();
  const [modalOpen, setModalOpen] = useState(false);

  if (isLoading) return <LoadingState type="full" />;
  if (!record) {
    return (
      <EmptyState
        title="Maintenance record not found"
        description="It may have been deleted, or the link is incorrect."
        action={{ label: 'Back to records', onClick: () => router.push(MAINTENANCE_ROUTES.list) }}
      />
    );
  }

  const overdue = isRecordOverdue(record);

  async function handleSubmit(values: MaintenanceFormValues) {
    await updateRecord.mutateAsync(values);
  }

  async function handleDelete() {
    if (!window.confirm(`Delete the maintenance record "${record.title}"?`)) return;
    await deleteRecord.mutateAsync(record._id);
    router.push(MAINTENANCE_ROUTES.list);
  }

  async function handleComplete() {
    await completeRecord.mutateAsync({ id: record._id });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={record.title}
        description={`${record.license_plate} · Due ${formatDate(record.due_date)}`}
        breadcrumbs={[
          { label: 'Maintenance', href: MAINTENANCE_ROUTES.dashboard },
          { label: 'Records', href: MAINTENANCE_ROUTES.list },
          { label: record.title },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {canComplete && record.status !== 'completed' && (
              <Button variant="outline" size="sm" onClick={handleComplete}>
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                Mark complete
              </Button>
            )}
            {canManage && (
              <Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            )}
            {canDelete && (
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm font-medium">Service details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Status</p>
              <Badge className={STATUS_BADGE_CLASSES[overdue ? 'overdue' : record.status]}>
                {getStatusLabel(overdue ? 'overdue' : record.status)}
              </Badge>
            </div>
            <div>
              <p className="text-muted-foreground">Priority</p>
              <Badge className={PRIORITY_BADGE_CLASSES[record.priority ?? 'medium']}>
                {getPriorityLabel(record.priority)}
              </Badge>
            </div>
            <div>
              <p className="text-muted-foreground">Category</p>
              <p className="font-medium">{record.category ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Service type</p>
              <p className="font-medium">{record.service_type ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Assigned to</p>
              <p className="font-medium">{record.assigned_to ?? 'Unassigned'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Estimated cost</p>
              <p className="font-medium">{formatEstimatedCost(record.estimated_cost)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Due date</p>
              <p className="font-medium">{formatDate(record.due_date)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Completion date</p>
              <p className="font-medium">{record.completion_date ? formatDate(record.completion_date) : '—'}</p>
            </div>
            {record.recurrence_interval && (
              <div>
                <p className="text-muted-foreground">Recurrence</p>
                <p className="font-medium">{record.recurrence_interval}</p>
              </div>
            )}
            {record.notes && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Notes</p>
                <p className="font-medium whitespace-pre-wrap">{record.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Vehicle</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-semibold">{record.license_plate}</p>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => router.push(MAINTENANCE_ROUTES.vehicleHistory(record.license_plate))}
            >
              View full service history
            </Button>
          </CardContent>
        </Card>
      </div>

      <MaintenanceModal
        open={modalOpen}
        mode="edit"
        record={record}
        onOpenChange={setModalOpen}
        onSubmit={handleSubmit}
        isSubmitting={updateRecord.isPending}
      />
    </div>
  );
}