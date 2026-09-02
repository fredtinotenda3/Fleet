// frontend/modules/workflows/components/WorkflowInstanceTable.tsx

'use client';

import { Ban, GitBranch } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { WorkflowInstanceStatusBadge } from './WorkflowInstanceStatusBadge';
import { formatOrgUnit, formatWorkflowDate } from '../utils';
import type { WorkflowInstance } from '../types';

interface WorkflowInstanceTableProps {
  instances: WorkflowInstance[] | undefined;
  isLoading: boolean;
  canCancel: boolean;
  onCancel: (instance: WorkflowInstance) => void;
}

export function WorkflowInstanceTable({ instances, isLoading, canCancel, onCancel }: WorkflowInstanceTableProps) {
  if (isLoading && !instances) {
    return <LoadingState type="table" count={5} />;
  }

  const rows = instances ?? [];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<GitBranch className="w-10 h-10 text-muted-foreground" />}
        title="No workflow instances found"
        description="Instances for this entity will appear here once a workflow starts against it."
      />
    );
  }

  return (
    <div className="overflow-x-auto border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Workflow</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Org unit</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Current step</TableHead>
            <TableHead>Created</TableHead>
            {canCancel && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((instance) => (
            <TableRow key={instance._id}>
              <TableCell className="font-medium">{instance.workflowId}</TableCell>
              <TableCell>
                {instance.entityType} / {instance.entityId}
              </TableCell>
              <TableCell>{formatOrgUnit(instance.orgUnitId)}</TableCell>
              <TableCell>
                <WorkflowInstanceStatusBadge status={instance.status} />
              </TableCell>
              <TableCell>{instance.currentStepId}</TableCell>
              <TableCell>{formatWorkflowDate(instance.createdAt)}</TableCell>
              {canCancel && (
                <TableCell>
                  <div className="flex justify-end gap-1">
                    {instance.status === 'pending' || instance.status === 'in_progress' ? (
                      <Button variant="ghost" size="icon" onClick={() => onCancel(instance)} title="Cancel">
                        <Ban className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
