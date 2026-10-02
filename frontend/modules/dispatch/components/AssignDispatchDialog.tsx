// frontend/modules/dispatch/components/AssignDispatchDialog.tsx

'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/shared/ui/feedback/dialog';
import { AssignDispatchForm } from './AssignDispatchForm';
import type { AssignDispatchPayload, DispatchJob } from '../types';

interface AssignDispatchDialogProps {
  open: boolean;
  job: DispatchJob | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: AssignDispatchPayload) => Promise<void>;
  isSubmitting?: boolean;
}

export function AssignDispatchDialog({ open, job, onOpenChange, onSubmit, isSubmitting }: AssignDispatchDialogProps) {
  async function handleSubmit(values: AssignDispatchPayload) {
    await onSubmit(values);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign vehicle and driver</DialogTitle>
          <DialogDescription>
            {job
              ? `Assign a vehicle and driver to "${job.title}".`
              : 'Assign a vehicle and driver to this dispatch job.'}
          </DialogDescription>
        </DialogHeader>
        <AssignDispatchForm onSubmit={handleSubmit} onCancel={() => onOpenChange(false)} isSubmitting={isSubmitting} />
      </DialogContent>
    </Dialog>
  );
}
