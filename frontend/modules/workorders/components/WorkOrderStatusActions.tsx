// frontend/modules/workorders/components/WorkOrderStatusActions.tsx
//
// Renders only the status transitions the backend's VALID_TRANSITIONS
// map (workorder.service.ts, mirrored here as
// WORK_ORDER_VALID_TRANSITIONS) actually allows from the work order's
// current status, so a user can never click into a 409 ConflictError.
// Assigning a mechanic (open -> assigned) is handled separately by
// AssignMechanicForm/AssignMechanicDialog, since that transition also
// needs a mechanic/bay selection the other transitions don't.

'use client';

import { PlayCircle, PauseCircle, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { useChangeWorkOrderStatus } from '../hooks/useWorkOrderMutations';
import { getNextStatuses, canManageWorkOrders, canCompleteWorkOrders } from '../utils';
import type { WorkOrder, WorkOrderStatus } from '../types';

interface WorkOrderStatusActionsProps {
  workOrder: WorkOrder;
  roles: string[];
}

export function WorkOrderStatusActions({ workOrder, roles }: WorkOrderStatusActionsProps) {
  const changeStatus = useChangeWorkOrderStatus(workOrder._id!);
  const nextStatuses = getNextStatuses(workOrder.status);
  const canManage = canManageWorkOrders(roles);
  const canComplete = canCompleteWorkOrders(roles);

  if (nextStatuses.length === 0) return null;

  function transitionTo(status: WorkOrderStatus) {
    if (status === 'cancelled') {
      const reason = window.prompt('Reason for cancelling this work order (optional):') ?? undefined;
      changeStatus.mutate({ status, reason });
      return;
    }
    changeStatus.mutate({ status });
  }

  const isBusy = changeStatus.isPending;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {nextStatuses.includes('in_progress') && canManage && (
        <Button variant="outline" size="sm" disabled={isBusy} onClick={() => transitionTo('in_progress')}>
          <PlayCircle className="h-3.5 w-3.5" />
          Start work
        </Button>
      )}
      {nextStatuses.includes('on_hold') && canManage && (
        <Button variant="outline" size="sm" disabled={isBusy} onClick={() => transitionTo('on_hold')}>
          <PauseCircle className="h-3.5 w-3.5" />
          Put on hold
        </Button>
      )}
      {nextStatuses.includes('completed') && canComplete && (
        <Button variant="outline" size="sm" disabled={isBusy} onClick={() => transitionTo('completed')}>
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          Mark complete
        </Button>
      )}
      {nextStatuses.includes('cancelled') && canManage && (
        <Button variant="destructive" size="sm" disabled={isBusy} onClick={() => transitionTo('cancelled')}>
          <XCircle className="h-3.5 w-3.5" />
          Cancel
        </Button>
      )}
    </div>
  );
}