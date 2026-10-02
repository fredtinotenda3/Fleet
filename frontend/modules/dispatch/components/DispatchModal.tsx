// frontend/modules/dispatch/components/DispatchModal.tsx

'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/shared/ui/feedback/dialog';
import { DispatchForm } from './DispatchForm';
import type { DispatchJobCreateDTO } from '../types';

interface DispatchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: DispatchJobCreateDTO) => Promise<unknown>;
  isSubmitting?: boolean;
}

/**
 * Create only. Editing a dispatch job is a sequence of
 * permission-gated transitions (assign vehicle + driver, change status,
 * link a trip) that already have their own components -- mirrors
 * WorkOrderModal.tsx's identical reasoning.
 */
export function DispatchModal({ open, onOpenChange, onSubmit, isSubmitting }: DispatchModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-form-wide">
        <DialogHeader>
          <DialogTitle>New dispatch job</DialogTitle>
          <DialogDescription>
            Raise a job to be dispatched. Assigning a vehicle and driver, tracking its execution and
            linking the trip that carries it out happen on the job itself once it exists.
          </DialogDescription>
        </DialogHeader>
        <DispatchForm
          onSubmit={async (values) => {
            await onSubmit(values);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
}
