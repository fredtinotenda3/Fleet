// frontend/modules/workorders/pages/WorkOrderDetailPage.tsx

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Package, Clock } from 'lucide-react';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { ErrorState, describeQueryError } from '@/frontend/shared/ui/patterns';
import { formatDate } from '@/shared/utils/date.utils';
import { useSessionStore } from '@/frontend/shared/store/session.store';
import { useWorkOrder } from '../hooks/useWorkOrders';
import { useAssignMechanic, useConsumeParts, useRecordLabor } from '../hooks/useWorkOrderMutations';
import { usePartNames } from '@/frontend/modules/inventory/hooks';
import { WorkOrderStatusBadge } from '../components/WorkOrderStatusBadge';
import { WorkOrderStatusActions } from '../components/WorkOrderStatusActions';
import { AssignMechanicDialog } from '../components/AssignMechanicDialog';
import { ConsumePartsDialog } from '../components/ConsumePartsDialog';
import { RecordLaborDialog } from '../components/RecordLaborDialog';
import {
  PRIORITY_BADGE_CLASSES,
  getPriorityLabel,
  formatWorkOrderCost,
  canAssignWorkOrders,
  canManageWorkOrders,
} from '../utils';
import { WORKORDER_ROUTES } from '../routes';
import type { AssignMechanicPayload } from '../types';

interface WorkOrderDetailPageProps {
  id: string;
}

export function WorkOrderDetailPage({ id }: WorkOrderDetailPageProps) {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const roles = user?.roles ?? [];
  const canAssign = canAssignWorkOrders(roles);
  /*
    Both cost endpoints are wrapped in
    `withAuth({permission: WORKORDER_MANAGE})`, so the buttons are gated
    on exactly the permission the server enforces -- not on a broader
    proxy that would render a control the API then refuses.
  */
  const canRecordCosts = canManageWorkOrders(roles);

  const { data: workOrder, isLoading, isError, error, refetch } = useWorkOrder(id);
  const assignMechanic = useAssignMechanic(id);
  const consumeParts = useConsumeParts(id);
  const recordLabor = useRecordLabor(id);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [partsDialogOpen, setPartsDialogOpen] = useState(false);
  const [laborDialogOpen, setLaborDialogOpen] = useState(false);

  // Resolves the part ids on this job to names. Only fetched when there
  // is at least one line to resolve -- see usePartNames.
  const partIds = workOrder?.partsUsed?.map((p) => p.sparePartId) ?? [];
  const { nameFor, partFor } = usePartNames(partIds, Boolean(workOrder));

  if (isLoading) return <LoadingState type="full" />;
  // The failure branch has to be checked before the not-found branch, because a
  // request that failed leaves `workOrder` undefined exactly as a deleted work
  // order does. Without this the page told a mechanic their job had been
  // removed every time the API was merely unreachable, which is how an open
  // defect quietly stops being anybody's problem.
  if (isError) {
    return (
      <ErrorState
        title="This work order didn't load"
        description="The work order could not be fetched. This does not mean it has been cancelled or removed."
        detail={describeQueryError(error)}
        onRetry={() => refetch()}
        size="page"
      />
    );
  }
  if (!workOrder) {
    return (
      <EmptyState
        title="Work order not found"
        description="It may have been removed, or the link is incorrect."
        action={{ label: 'Back to work orders', onClick: () => router.push(WORKORDER_ROUTES.list) }}
      />
    );
  }

  async function handleAssign(values: AssignMechanicPayload) {
    await assignMechanic.mutateAsync(values);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={workOrder.title}
        description={`${workOrder.license_plate} · Opened ${formatDate(workOrder.openedAt)}`}
        breadcrumbs={[
          { label: 'Work orders', href: WORKORDER_ROUTES.list },
          { label: workOrder.title },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {canAssign && workOrder.status === 'open' && (
              <Button variant="outline" size="sm" onClick={() => setAssignDialogOpen(true)}>
                <UserPlus className="h-3.5 w-3.5" />
                Assign mechanic
              </Button>
            )}
            {/*
              Costs can only be recorded while the job is actually being
              worked. `WorkOrderService.consumeParts` refuses any other
              status outright, and recording labour against a completed
              or cancelled job would silently change a figure someone has
              already signed off. The buttons mirror the server rule
              rather than appearing and then failing.
            */}
            {canRecordCosts && ['assigned', 'in_progress'].includes(workOrder.status) && (
              <>
                <Button variant="outline" size="sm" onClick={() => setPartsDialogOpen(true)}>
                  <Package className="h-3.5 w-3.5" />
                  Record parts
                </Button>
                <Button variant="outline" size="sm" onClick={() => setLaborDialogOpen(true)}>
                  <Clock className="h-3.5 w-3.5" />
                  {workOrder.laborHours ? 'Revise labour' : 'Record labour'}
                </Button>
              </>
            )}
            <WorkOrderStatusActions workOrder={workOrder} roles={roles} />
          </div>
        }
      />

      {workOrder.source === 'dvir' && (
        <div className="p-3 border rounded-md border-info-border bg-info-bg text-body-sm text-info">
          Raised automatically from a driver vehicle inspection defect report.
          {workOrder.photoUrl && (
            <>
              {' '}
              <a href={workOrder.photoUrl} target="_blank" rel="noreferrer" className="underline">
                View defect photo
              </a>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm font-medium">Work order details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Status</p>
              <WorkOrderStatusBadge status={workOrder.status} />
            </div>
            <div>
              <p className="text-muted-foreground">Priority</p>
              <Badge className={PRIORITY_BADGE_CLASSES[workOrder.priority ?? 'medium']}>
                {getPriorityLabel(workOrder.priority)}
              </Badge>
            </div>
            <div>
              <p className="text-muted-foreground">Vehicle</p>
              <p className="font-medium">{workOrder.license_plate}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Assigned mechanic</p>
              <p className="font-medium">{workOrder.assignedMechanicId ?? 'Unassigned'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Opened</p>
              <p className="font-medium">{formatDate(workOrder.openedAt)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Started</p>
              <p className="font-medium">{workOrder.startedAt ? formatDate(workOrder.startedAt) : '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Completed</p>
              <p className="font-medium">{workOrder.completedAt ? formatDate(workOrder.completedAt) : '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Labor hours</p>
              <p className="font-medium">{workOrder.laborHours ?? '—'}</p>
            </div>
            {workOrder.description && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Description</p>
                <p className="font-medium whitespace-pre-wrap">{workOrder.description}</p>
              </div>
            )}
            {workOrder.status === 'cancelled' && workOrder.cancelledReason && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Cancellation reason</p>
                <p className="font-medium whitespace-pre-wrap">{workOrder.cancelledReason}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Costs</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Parts</span>
              <span className="font-medium">{formatWorkOrderCost(workOrder.partsCost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Labor</span>
              <span className="font-medium">{formatWorkOrderCost(workOrder.laborCost)}</span>
            </div>
            <div className="flex justify-between pt-2 font-semibold border-t border-border">
              <span>Total</span>
              <span>{formatWorkOrderCost(workOrder.totalCost)}</span>
            </div>
            {workOrder.partsUsed.length > 0 && (
              <div className="pt-2">
                <p className="mb-1 text-muted-foreground">Parts used</p>
                <ul className="space-y-1">
                  {/*
                    These rendered the raw `sparePartId` -- a 24-character
                    ObjectId -- because nothing in the frontend could
                    resolve a part id to a part. `nameFor` returns null
                    rather than guessing when a part cannot be found
                    (deleted, or outside the page it read), and the id is
                    shown in that case: an unresolvable id is still more
                    honest than a fabricated name, and it is what the
                    person would need to look the part up by hand.
                  */}
                  {workOrder.partsUsed.map((part) => {
                    const name = nameFor(part.sparePartId);
                    const sku = partFor(part.sparePartId)?.sku;
                    return (
                      <li key={part.sparePartId} className="flex justify-between gap-2">
                        <span className="min-w-0 truncate">
                          {name ?? part.sparePartId}
                          {sku && <span className="ml-1 text-muted-foreground">({sku})</span>}
                        </span>
                        <span className="shrink-0">× {part.quantity}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AssignMechanicDialog
        open={assignDialogOpen}
        workOrder={workOrder}
        onOpenChange={setAssignDialogOpen}
        onSubmit={handleAssign}
        isSubmitting={assignMechanic.isPending}
      />

      <ConsumePartsDialog
        open={partsDialogOpen}
        workOrder={workOrder}
        onOpenChange={setPartsDialogOpen}
        onSubmit={(values) => consumeParts.mutateAsync(values)}
        isSubmitting={consumeParts.isPending}
      />

      <RecordLaborDialog
        open={laborDialogOpen}
        workOrder={workOrder}
        onOpenChange={setLaborDialogOpen}
        onSubmit={(values) => recordLabor.mutateAsync(values)}
        isSubmitting={recordLabor.isPending}
      />
    </div>
  );
}