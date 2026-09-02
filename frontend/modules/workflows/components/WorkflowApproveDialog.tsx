// frontend/modules/workflows/components/WorkflowApproveDialog.tsx

'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/frontend/shared/ui/feedback/dialog';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Textarea } from '@/frontend/shared/ui/forms/textarea';
import type { WorkflowInstance } from '../types';

interface WorkflowApproveDialogProps {
  open: boolean;
  instance: WorkflowInstance | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (comment: string) => Promise<void>;
  isSubmitting?: boolean;
}

/** comment is optional server-side (workflowApproveSchema defaults it to ''), so this never blocks submission on an empty field. */
export function WorkflowApproveDialog({
  open,
  instance,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: WorkflowApproveDialogProps) {
  const [comment, setComment] = useState('');

  async function handleSubmit() {
    await onSubmit(comment);
    setComment('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Approve step</DialogTitle>
          <DialogDescription>
            {instance
              ? `Approve the current step for ${instance.entityType} / ${instance.entityId}.`
              : 'Approve the current step.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="approve-comment">Comment (optional)</Label>
          <Textarea
            id="approve-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add any context for this decision..."
            maxLength={1000}
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
