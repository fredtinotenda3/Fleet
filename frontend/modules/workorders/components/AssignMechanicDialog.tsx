// frontend/modules/workorders/components/AssignMechanicDialog.tsx

'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/shared/ui/feedback/dialog';
import { AssignMechanicForm } from './AssignMechanicForm';
import type { AssignMechanicPayload, WorkOrder } from '../types';

interface AssignMechanicDialogProps {
  open: boolean;
  workOrder: WorkOrder | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: AssignMechanicPayload) => Promise<void>;
  isSubmitting?: boolean;
}

export function AssignMechanicDialog({ open, workOrder, onOpenChange, onSubmit, isSubmitting }: AssignMechanicDialogProps) {
  async function handleSubmit(values: AssignMechanicPayload) {
    await onSubmit(values);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign mechanic</DialogTitle>
          <DialogDescription>
            {workOrder ? `Assign a mechanic to "${workOrder.title}" (${workOrder.license_plate}).` : 'Assign a mechanic to this work order.'}
          </DialogDescription>
        </DialogHeader>
        <AssignMechanicForm onSubmit={handleSubmit} onCancel={() => onOpenChange(false)} isSubmitting={isSubmitting} />
      </DialogContent>
    </Dialog>
  );
}