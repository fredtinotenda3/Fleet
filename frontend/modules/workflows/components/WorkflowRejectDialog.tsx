// frontend/modules/workflows/components/WorkflowRejectDialog.tsx

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

interface WorkflowRejectDialogProps {
  open: boolean;
  instance: WorkflowInstance | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => Promise<void>;
  isSubmitting?: boolean;
}

/** reason is REQUIRED server-side (workflowRejectSchema: min 1 char) -- submit is disabled until something is entered. */
export function WorkflowRejectDialog({
  open,
  instance,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: WorkflowRejectDialogProps) {
  const [reason, setReason] = useState('');

  function handleOpenChange(next: boolean) {
    if (!next) setReason('');
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (!reason.trim()) return;
    await onSubmit(reason.trim());
    setReason('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reject step</DialogTitle>
          <DialogDescription>
            {instance
              ? `Reject the current step for ${instance.entityType} / ${instance.entityId}. This is recorded and cannot be undone.`
              : 'Reject the current step.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="reject-reason">
            Reason <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this is being rejected..."
            maxLength={1000}
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={isSubmitting || !reason.trim()}>
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
