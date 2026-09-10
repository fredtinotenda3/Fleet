// frontend/modules/maintenance/components/MaintenanceModal.tsx

'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/shared/ui/feedback/dialog';
import { MaintenanceForm } from './MaintenanceForm';
import type { MaintenanceFormOutput } from '../schemas';
import type { Reminder } from '../types';

export type MaintenanceModalMode = 'create' | 'edit';

interface MaintenanceModalProps {
  open: boolean;
  mode: MaintenanceModalMode;
  record?: Reminder | null;
  /** Pre-selects the vehicle when creating. See FuelModal for the rationale. */
  defaultLicensePlate?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: MaintenanceFormOutput) => Promise<void>;
  isSubmitting?: boolean;
}

export function MaintenanceModal({
  open,
  mode,
  record,
  defaultLicensePlate,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: MaintenanceModalProps) {
  async function handleSubmit(values: MaintenanceFormOutput) {
    await onSubmit(values);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'edit'
              ? 'Edit maintenance record'
              : defaultLicensePlate
              ? `New maintenance record for ${defaultLicensePlate}`
              : 'New maintenance record'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'edit'
              ? 'Update the service details for this maintenance record.'
              : 'Schedule a new service or repair for a vehicle in your fleet.'}
          </DialogDescription>
        </DialogHeader>
        <MaintenanceForm
          key={`${mode}-${record?._id ?? defaultLicensePlate ?? 'new'}`}
          record={mode === 'edit' ? record : null}
          defaultLicensePlate={defaultLicensePlate}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
}