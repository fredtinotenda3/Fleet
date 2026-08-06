// frontend/modules/drivers/components/DriverModal.tsx

'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/shared/ui/feedback/dialog';
import { DriverForm } from './DriverForm';
import type { Driver } from '../types';
import type { DriverFormValues } from '../schemas';

export type DriverModalMode = 'create' | 'edit';

interface DriverModalProps {
  open: boolean;
  mode: DriverModalMode;
  driver?: Driver | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: DriverFormValues) => Promise<unknown>;
}

/** `license_expiry` arrives as a Date (or ISO string) but the form field is
 *  an <input type="date">, which requires exactly `yyyy-MM-dd`. */
function toDateInputValue(value?: Date | string): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function DriverModal({ open, mode, driver, onOpenChange, onSubmit }: DriverModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-form-wide">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit driver' : 'Add driver'}</DialogTitle>
          <DialogDescription>
            {mode === 'edit'
              ? "Update this driver's details, licence and status."
              : 'Add a driver so they can be assigned to trips, fuel logs and work orders.'}
          </DialogDescription>
        </DialogHeader>
        <DriverForm
          // Remount on identity change so the form resets between records
          // rather than carrying the previous driver's values over.
          key={`${mode}-${driver?._id ?? 'new'}`}
          defaultValues={
            driver
              ? {
                  name: driver.name,
                  email: driver.email ?? '',
                  phone: driver.phone ?? '',
                  driver_code: driver.driver_code ?? '',
                  license_number: driver.license_number ?? '',
                  license_expiry: toDateInputValue(driver.license_expiry),
                  status: driver.status,
                  notes: driver.notes ?? '',
                }
              : undefined
          }
          onSubmit={async (values) => {
            await onSubmit(values);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
          submitLabel={mode === 'edit' ? 'Save changes' : 'Add driver'}
        />
      </DialogContent>
    </Dialog>
  );
}

export default DriverModal;
