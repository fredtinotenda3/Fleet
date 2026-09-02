// frontend/modules/workflows/components/WorkflowDefinitionTable.tsx

'use client';

import { Pencil, Trash2, Workflow as WorkflowIcon } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/shared/ui/data-display/table';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { WorkflowStatusBadge } from './WorkflowStatusBadge';
import { WORKFLOW_TYPE_LABELS, type WorkflowDefinition } from '../types';
import { formatWorkflowDate } from '../utils';

interface WorkflowDefinitionTableProps {
  workflows: WorkflowDefinition[] | undefined;
  isLoading: boolean;
  canManage: boolean;
  onEdit: (workflow: WorkflowDefinition) => void;
  onDelete: (workflow: WorkflowDefinition) => void;
}

export function WorkflowDefinitionTable({
  workflows,
  isLoading,
  canManage,
  onEdit,
  onDelete,
}: WorkflowDefinitionTableProps) {
  if (isLoading && !workflows) {
    return <LoadingState type="table" count={5} />;
  }

  const rows = workflows ?? [];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<WorkflowIcon className="w-10 h-10 text-muted-foreground" />}
        title="No workflows defined"
        description="Workflow definitions describe an approval policy -- steps, triggers, and who decides each one."
      />
    );
  }

  return (
    <div className="overflow-x-auto border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Steps</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Updated</TableHead>
            {canManage && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((workflow) => (
            <TableRow key={workflow._id}>
              <TableCell className="font-medium">{workflow.name}</TableCell>
              <TableCell>
                <Badge variant="outline">{WORKFLOW_TYPE_LABELS[workflow.type] ?? workflow.type}</Badge>
              </TableCell>
              <TableCell>
                <WorkflowStatusBadge status={workflow.status} />
              </TableCell>
              <TableCell>{workflow.steps.length}</TableCell>
              <TableCell>v{workflow.version}</TableCell>
              <TableCell>{formatWorkflowDate(workflow.updatedAt)}</TableCell>
              {canManage && (
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => onEdit(workflow)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(workflow)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
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
