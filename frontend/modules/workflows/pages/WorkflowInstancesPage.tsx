// frontend/modules/workflows/pages/WorkflowInstancesPage.tsx
//
// Gated on Permission.WORKFLOW_VIEW, matching GET /api/workflows/instances's
// own gate. GET /api/workflows/instances (workflowController.getInstancesForEntity)
// REQUIRES entityId + entityType query params -- there is no general
// "list every instance in my scope" route today (see the note in
// ../types/index.ts). This page is therefore an entity lookup rather
// than a free browse: pick an entity type and enter its id to see the
// workflow instances raised against it. Deep links
// (/workflows/instances?entityType=...&entityId=...) pre-fill the
// lookup, so a link from an expense/maintenance page can land here
// with results already showing.

'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/frontend/modules/auth/hooks/useAuth';
import { Permission, permissionService } from '@/server/permissions/roles';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Alert, AlertTitle, AlertDescription } from '@/frontend/shared/ui/feedback/alert';
import { Card, CardContent } from '@/frontend/shared/ui/data-display/card';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { useWorkflowInstances } from '../hooks/useWorkflows';
import { useCancelWorkflowInstance } from '../hooks/useWorkflowMutations';
import { WorkflowInstanceTable } from '../components/WorkflowInstanceTable';
import { canCancelWorkflowInstance } from '../utils';
import type { WorkflowInstance } from '../types';

export function WorkflowInstancesPage() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const hasAccess = permissionService.hasPermission(roles, Permission.WORKFLOW_VIEW);
  const canCancel = canCancelWorkflowInstance(roles);

  const searchParams = useSearchParams();
  const [entityType, setEntityType] = useState(searchParams.get('entityType') ?? '');
  const [entityId, setEntityId] = useState(searchParams.get('entityId') ?? '');
  const [submitted, setSubmitted] = useState<{ entityType: string; entityId: string } | null>(
    searchParams.get('entityType') && searchParams.get('entityId')
      ? { entityType: searchParams.get('entityType') as string, entityId: searchParams.get('entityId') as string }
      : null
  );

  const { data: instances, isLoading, isError, error } = useWorkflowInstances(submitted ?? {});

  if (!hasAccess) {
    return (
      <EmptyState
        title="You don't have access to this page"
        description="Workflow instances aren't available to your role."
      />
    );
  }

  function handleLookup() {
    if (!entityType.trim() || !entityId.trim()) return;
    setSubmitted({ entityType: entityType.trim(), entityId: entityId.trim() });
  }

  return (
    <div className="p-4 space-y-6 sm:p-6">
      <PageHeader
        title="Workflow instances"
        description="Find the workflow instances raised against a specific record."
        breadcrumbs={[{ label: 'Workflows', href: '/workflows' }, { label: 'Instances' }]}
      />

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="entity-type">Entity type</Label>
            <Input
              id="entity-type"
              placeholder="e.g. expense, work_order, driver"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
            />
          </div>
          <div className="flex-1 space-y-2">
            <Label htmlFor="entity-id">Entity id</Label>
            <Input id="entity-id" value={entityId} onChange={(e) => setEntityId(e.target.value)} />
          </div>
          <Button onClick={handleLookup} disabled={!entityType.trim() || !entityId.trim()}>
            <Search className="mr-1 h-3.5 w-3.5" />
            Find instances
          </Button>
        </CardContent>
      </Card>

      {!submitted ? (
        <EmptyState
          title="Enter an entity to search"
          description="Workflow instances are looked up by the record they were started against -- enter its type and id above."
        />
      ) : isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Couldn't load workflow instances</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'An unexpected error occurred.'}
          </AlertDescription>
        </Alert>
      ) : (
        <WorkflowInstanceTableSection instances={instances} isLoading={isLoading} canCancel={canCancel} />
      )}
    </div>
  );
}

/**
 * useCancelWorkflowInstance takes the instance id per-call (via
 * mutateAsync({ id, reason })) rather than being bound to one id up
 * front, so a single hook instance can serve every row in the table.
 */
function WorkflowInstanceTableSection({
  instances,
  isLoading,
  canCancel,
}: {
  instances: WorkflowInstance[] | undefined;
  isLoading: boolean;
  canCancel: boolean;
}) {
  const cancelInstance = useCancelWorkflowInstance();

  async function handleCancel(instance: WorkflowInstance) {
    if (!instance._id) return;
    if (!window.confirm('Cancel this workflow instance? This cannot be undone.')) return;
    const reason = window.prompt('Reason for cancelling (optional):') ?? undefined;
    await cancelInstance.mutateAsync({ id: instance._id, reason: reason || undefined });
  }

  return (
    <WorkflowInstanceTable instances={instances} isLoading={isLoading} canCancel={canCancel} onCancel={handleCancel} />
  );
}
