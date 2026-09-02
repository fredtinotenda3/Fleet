// frontend/modules/workflows/components/WorkflowTaskList.tsx

'use client';

import { Check, X, ClipboardCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { WorkflowInstanceStatusBadge } from './WorkflowInstanceStatusBadge';
import { WorkflowStepStatusBadge } from './WorkflowStepStatusBadge';
import { formatWorkflowDate, isStepActionable } from '../utils';
import type { WorkflowInstance } from '../types';

interface WorkflowTaskListProps {
  instances: WorkflowInstance[] | undefined;
  isLoading: boolean;
  canApprove: boolean;
  canReject: boolean;
  onApprove: (instance: WorkflowInstance) => void;
  onReject: (instance: WorkflowInstance) => void;
}

/**
 * Renders GET /api/workflows/instances/my-tasks's results -- each
 * instance whose currentStepId is assigned to (or role-matched for)
 * the calling user. The approve/reject buttons are offered whenever
 * the user holds the relevant permission AND the current step is
 * still actionable (isStepActionable); the backend applies the real,
 * finer-grained assignee/role check when the action is submitted (see
 * canApproveStep/canRejectStep in ../utils), so a click here can still
 * come back with a 403 for a step this user isn't the right person
 * for -- that's surfaced via the mutation's error toast, not hidden
 * client-side.
 */
export function WorkflowTaskList({
  instances,
  isLoading,
  canApprove,
  canReject,
  onApprove,
  onReject,
}: WorkflowTaskListProps) {
  if (isLoading && !instances) {
    return <LoadingState type="card" count={3} />;
  }

  const rows = instances ?? [];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardCheck className="w-10 h-10 text-muted-foreground" />}
        title="No tasks waiting on you"
        description="Workflow steps assigned to you, by name or by role, will show up here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((instance) => {
        const currentStep = instance.steps.find((step) => step.stepId === instance.currentStepId);
        const actionable = currentStep ? isStepActionable(currentStep) : false;

        return (
          <Card key={instance._id}>
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">
                  {instance.entityType} / {instance.entityId}
                </CardTitle>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  Step: {instance.currentStepId} &middot; Started {formatWorkflowDate(instance.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <WorkflowInstanceStatusBadge status={instance.status} />
                {currentStep && <WorkflowStepStatusBadge status={currentStep.status} />}
              </div>
            </CardHeader>
            <CardContent className="flex items-center justify-end gap-2">
              {canReject && actionable && (
                <Button variant="outline" size="sm" onClick={() => onReject(instance)}>
                  <X className="mr-1 h-3.5 w-3.5" />
                  Reject
                </Button>
              )}
              {canApprove && actionable && (
                <Button size="sm" onClick={() => onApprove(instance)}>
                  <Check className="mr-1 h-3.5 w-3.5" />
                  Approve
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
