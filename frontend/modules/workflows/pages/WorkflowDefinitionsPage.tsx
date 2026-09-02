// frontend/modules/workflows/pages/WorkflowDefinitionsPage.tsx
//
// Gated on Permission.WORKFLOW_VIEW, matching GET /api/workflows's own
// gate (see app/api/workflows/route.ts). This check is a UI
// convenience only -- it hides the page for people who'd get a 403
// anyway -- the API's withAuth wrapper remains the actual enforcement
// point. WORKFLOW_MANAGE additionally reveals create/edit/delete.

'use client';

import { useState } from 'react';
import { Plus, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { Permission, permissionService } from '@/server/permissions/roles';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Alert, AlertTitle, AlertDescription } from '@/frontend/shared/ui/feedback/alert';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { useWorkflows } from '../hooks/useWorkflows';
import { useCreateWorkflow, useUpdateWorkflow, useDeleteWorkflow } from '../hooks/useWorkflowMutations';
import { WorkflowDefinitionTable } from '../components/WorkflowDefinitionTable';
import { WorkflowDefinitionDialog } from '../components/WorkflowDefinitionDialog';
import { canManageWorkflows } from '../utils';
import type { WorkflowDefinition, WorkflowCreatePayload } from '../types';

export function WorkflowDefinitionsPage() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const hasAccess = permissionService.hasPermission(roles, Permission.WORKFLOW_VIEW);
  const canManage = canManageWorkflows(roles);

  const { data: workflows, isLoading, isError, error } = useWorkflows({ activeOnly: false });

  const createWorkflow = useCreateWorkflow();
  const [editTarget, setEditTarget] = useState<WorkflowDefinition | null>(null);
  const updateWorkflow = useUpdateWorkflow(editTarget?._id ?? '');
  const deleteWorkflow = useDeleteWorkflow();

  const [dialogOpen, setDialogOpen] = useState(false);

  if (!hasAccess) {
    return (
      <EmptyState
        title="You don't have access to this page"
        description="Workflow definitions aren't available to your role."
      />
    );
  }

  function openCreate() {
    setEditTarget(null);
    setDialogOpen(true);
  }

  function openEdit(workflow: WorkflowDefinition) {
    setEditTarget(workflow);
    setDialogOpen(true);
  }

  async function handleDelete(workflow: WorkflowDefinition) {
    if (!workflow._id) return;
    if (!window.confirm(`Delete the workflow "${workflow.name}"? This cannot be undone.`)) return;
    await deleteWorkflow.mutateAsync(workflow._id);
  }

  async function handleSubmit(payload: WorkflowCreatePayload) {
    if (editTarget?._id) {
      await updateWorkflow.mutateAsync(payload);
    } else {
      await createWorkflow.mutateAsync(payload);
    }
  }

  return (
    <div className="p-4 space-y-6 sm:p-6">
      <PageHeader
        title="Workflows"
        description="Approval policies -- steps, triggers, and who decides each one."
        breadcrumbs={[{ label: 'Workflows' }]}
        actions={
          canManage ? (
            <Button onClick={openCreate}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              New workflow
            </Button>
          ) : undefined
        }
      />

      {isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Couldn't load workflows</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'An unexpected error occurred.'}
          </AlertDescription>
        </Alert>
      ) : (
        <WorkflowDefinitionTable
          workflows={workflows}
          isLoading={isLoading}
          canManage={canManage}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      )}

      <WorkflowDefinitionDialog
        open={dialogOpen}
        workflow={editTarget}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        isSubmitting={createWorkflow.isPending || updateWorkflow.isPending}
      />
    </div>
  );
}
