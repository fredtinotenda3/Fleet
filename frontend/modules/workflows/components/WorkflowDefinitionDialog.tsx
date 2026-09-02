// frontend/modules/workflows/components/WorkflowDefinitionDialog.tsx

'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/shared/ui/feedback/dialog';
import { WorkflowDefinitionForm } from './WorkflowDefinitionForm';
import type { WorkflowCreatePayload, WorkflowDefinition } from '../types';

interface WorkflowDefinitionDialogProps {
  open: boolean;
  workflow: WorkflowDefinition | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: WorkflowCreatePayload) => Promise<void>;
  isSubmitting?: boolean;
}

export function WorkflowDefinitionDialog({
  open,
  workflow,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: WorkflowDefinitionDialogProps) {
  async function handleSubmit(payload: WorkflowCreatePayload) {
    await onSubmit(payload);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{workflow ? 'Edit workflow' : 'Create workflow'}</DialogTitle>
          <DialogDescription>
            {workflow
              ? `Update the "${workflow.name}" approval policy.`
              : 'Define a new approval policy: steps, triggers, and who decides each one.'}
          </DialogDescription>
        </DialogHeader>
        <WorkflowDefinitionForm
          initial={workflow ?? undefined}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
}
