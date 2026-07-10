// frontend/modules/fuel-stations/components/FuelStationModal.tsx

'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/shared/ui/feedback/dialog';
import { FuelStationForm } from './FuelStationForm';
import type { FuelStation } from '../types';
import type { FuelStationFormValues } from '../schemas';

export type FuelStationModalMode = 'create' | 'edit';

interface FuelStationModalProps {
  open: boolean;
  mode: FuelStationModalMode;
  station?: FuelStation | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: FuelStationFormValues) => Promise<unknown>;
}

export function FuelStationModal({ open, mode, station, onOpenChange, onSubmit }: FuelStationModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-form-wide">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit fuel station' : 'Add fuel station'}</DialogTitle>
          <DialogDescription>
            {mode === 'edit' ? "Update this station's details." : 'Register a fuel station used by your fleet.'}
          </DialogDescription>
        </DialogHeader>
        <FuelStationForm
          key={`${mode}-${station?._id ?? 'new'}`}
          defaultValues={
            station
              ? {
                  name: station.name,
                  brand: station.brand ?? '',
                  address: station.address ?? '',
                  city: station.city ?? '',
                  country: station.country ?? '',
                  phone: station.phone ?? '',
                  notes: station.notes ?? '',
                  isActive: station.isActive,
                }
              : undefined
          }
          onSubmit={async (values) => {
            await onSubmit(values);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
          submitLabel={mode === 'edit' ? 'Save changes' : 'Add station'}
        />
      </DialogContent>
    </Dialog>
  );
}