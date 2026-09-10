// frontend/modules/workorders/components/WorkOrderModal.tsx

'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/shared/ui/feedback/dialog';
import { WorkOrderForm } from './WorkOrderForm';
import type { WorkOrderCreateDTO } from '../types';

interface WorkOrderModalProps {
  open: boolean;
  /** Pre-selects the vehicle. See FuelModal for the rationale. */
  defaultLicensePlate?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: WorkOrderCreateDTO) => Promise<unknown>;
  isSubmitting?: boolean;
}

/**
 * Create only.
 *
 * Editing a work order is not a form -- it is a sequence of
 * permission-gated transitions (assign a mechanic, start, hold, complete
 * with parts and labour) that already have their own components. A
 * general "edit work order" dialog would give one permission the reach
 * of four.
 */
export function WorkOrderModal({
  open,
  defaultLicensePlate,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: WorkOrderModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-form-wide">
        <DialogHeader>
          <DialogTitle>
            {defaultLicensePlate ? `New work order for ${defaultLicensePlate}` : 'New work order'}
          </DialogTitle>
          <DialogDescription>
            Raise a job for the workshop. Assigning a mechanic, booking parts and recording labour
            happen on the work order itself once it exists.
          </DialogDescription>
        </DialogHeader>
        <WorkOrderForm
          key={defaultLicensePlate ?? 'new'}
          defaultLicensePlate={defaultLicensePlate}
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
