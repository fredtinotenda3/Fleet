// frontend/modules/workflows/pages/WorkflowMyTasksPage.tsx
//
// Gated on Permission.WORKFLOW_VIEW, matching GET
// /api/workflows/instances/my-tasks's own gate. Approve/reject actions
// are additionally gated on WORKFLOW_APPROVE / WORKFLOW_REJECT -- see
// canApproveStep/canRejectStep in ../utils for the caveat that the
// backend's real per-step assignee/role check happens on submit, not
// here.

'use client';

import { useState } from 'react';
import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { Permission, permissionService } from '@/server/permissions/roles';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Alert, AlertTitle, AlertDescription } from '@/frontend/shared/ui/feedback/alert';
import { AlertTriangle } from 'lucide-react';
import { useMyWorkflowTasks } from '../hooks/useWorkflows';
import { useApproveWorkflowStep, useRejectWorkflowStep } from '../hooks/useWorkflowMutations';
import { WorkflowTaskList } from '../components/WorkflowTaskList';
import { WorkflowApproveDialog } from '../components/WorkflowApproveDialog';
import { WorkflowRejectDialog } from '../components/WorkflowRejectDialog';
import { canApproveStep, canRejectStep } from '../utils';
import type { WorkflowInstance } from '../types';

export function WorkflowMyTasksPage() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const hasAccess = permissionService.hasPermission(roles, Permission.WORKFLOW_VIEW);
  const canApprove = canApproveStep(roles);
  const canReject = canRejectStep(roles);

  const { data: instances, isLoading, isError, error } = useMyWorkflowTasks({ enabled: hasAccess });
  const approveStep = useApproveWorkflowStep();
  const rejectStep = useRejectWorkflowStep();

  const [approveTarget, setApproveTarget] = useState<WorkflowInstance | null>(null);
  const [rejectTarget, setRejectTarget] = useState<WorkflowInstance | null>(null);

  if (!hasAccess) {
    return (
      <EmptyState
        title="You don't have access to this page"
        description="Workflow tasks aren't available to your role."
      />
    );
  }

  async function handleApprove(comment: string) {
    if (!approveTarget?._id) return;
    await approveStep.mutateAsync({
      instanceId: approveTarget._id,
      stepId: approveTarget.currentStepId,
      payload: comment ? { comment } : undefined,
    });
  }

  async function handleReject(reason: string) {
    if (!rejectTarget?._id) return;
    await rejectStep.mutateAsync({
      instanceId: rejectTarget._id,
      stepId: rejectTarget.currentStepId,
      payload: { reason },
    });
  }

  return (
    <div className="p-4 space-y-6 sm:p-6">
      <PageHeader
        title="My tasks"
        description="Workflow steps waiting on your approval or decision."
        breadcrumbs={[{ label: 'Workflows', href: '/workflows' }, { label: 'My tasks' }]}
      />

      {isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Couldn't load your tasks</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'An unexpected error occurred.'}
          </AlertDescription>
        </Alert>
      ) : (
        <WorkflowTaskList
          instances={instances}
          isLoading={isLoading}
          canApprove={canApprove}
          canReject={canReject}
          onApprove={setApproveTarget}
          onReject={setRejectTarget}
        />
      )}

      <WorkflowApproveDialog
        open={Boolean(approveTarget)}
        instance={approveTarget}
        onOpenChange={(open) => !open && setApproveTarget(null)}
        onSubmit={handleApprove}
        isSubmitting={approveStep.isPending}
      />

      <WorkflowRejectDialog
        open={Boolean(rejectTarget)}
        instance={rejectTarget}
        onOpenChange={(open) => !open && setRejectTarget(null)}
        onSubmit={handleReject}
        isSubmitting={rejectStep.isPending}
      />
    </div>
  );
}
