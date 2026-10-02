// frontend/modules/dispatch/components/DispatchStatusActions.tsx
//
// Renders only the status transitions the backend's VALID_TRANSITIONS
// map (dispatch.service.ts, mirrored here as DISPATCH_VALID_TRANSITIONS)
// actually allows from the job's current status, so a dispatcher can
// never click into a 409 ConflictError. Mirrors
// WorkOrderStatusActions.tsx's exact structure. Assigning a vehicle and
// driver (unassigned -> assigned) is handled separately by
// AssignDispatchForm/AssignDispatchDialog, since that transition also
// needs a vehicle/driver selection the other transitions don't.

'use client';

import { Truck, PlayCircle, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { useChangeDispatchStatus } from '../hooks/useDispatchMutations';
import { getNextStatuses, canManageDispatch } from '../utils';
import type { DispatchJob, DispatchJobStatus } from '../types';

interface DispatchStatusActionsProps {
  job: DispatchJob;
  roles: string[];
}

export function DispatchStatusActions({ job, roles }: DispatchStatusActionsProps) {
  const changeStatus = useChangeDispatchStatus(job._id!);
  const nextStatuses = getNextStatuses(job.status);
  const canManage = canManageDispatch(roles);

  if (nextStatuses.length === 0 || !canManage) return null;

  function transitionTo(status: DispatchJobStatus) {
    if (status === 'cancelled') {
      const reason = window.prompt('Reason for cancelling this dispatch job (optional):') ?? undefined;
      changeStatus.mutate({ status, reason });
      return;
    }
    changeStatus.mutate({ status });
  }

  const isBusy = changeStatus.isPending;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {nextStatuses.includes('en_route') && (
        <Button variant="outline" size="sm" disabled={isBusy} onClick={() => transitionTo('en_route')}>
          <Truck className="h-3.5 w-3.5" />
          Mark en route
        </Button>
      )}
      {nextStatuses.includes('in_progress') && (
        <Button variant="outline" size="sm" disabled={isBusy} onClick={() => transitionTo('in_progress')}>
          <PlayCircle className="h-3.5 w-3.5" />
          Mark in progress
        </Button>
      )}
      {nextStatuses.includes('completed') && (
        <Button variant="outline" size="sm" disabled={isBusy} onClick={() => transitionTo('completed')}>
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          Mark complete
        </Button>
      )}
      {nextStatuses.includes('cancelled') && (
        <Button variant="destructive" size="sm" disabled={isBusy} onClick={() => transitionTo('cancelled')}>
          <XCircle className="h-3.5 w-3.5" />
          Cancel
        </Button>
      )}
    </div>
  );
}
