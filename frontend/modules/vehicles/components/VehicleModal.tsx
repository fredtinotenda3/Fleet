//frontend/modules/vehicles/components/VehicleModal.tsx

'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/frontend/shared/ui/feedback/dialog';
import { VehicleForm } from './VehicleForm';
import type { Vehicle } from '../types';
import type { VehicleFormValues } from '../schemas';

export type VehicleModalMode = 'create' | 'edit' | 'duplicate';

interface VehicleModalProps {
  open: boolean;
  mode: VehicleModalMode;
  vehicle?: Vehicle | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: VehicleFormValues) => Promise<unknown>;
}

const TITLES: Record<VehicleModalMode, string> = {
  create: 'Add vehicle',
  edit: 'Edit vehicle',
  duplicate: 'Duplicate vehicle',
};

const DESCRIPTIONS: Record<VehicleModalMode, string> = {
  create: 'Register a new vehicle in your fleet.',
  edit: "Update this vehicle's details.",
  duplicate: 'Pre-filled from an existing vehicle. Update the license plate before saving.',
};

function toFormValues(vehicle: Vehicle | null | undefined, mode: VehicleModalMode): Partial<VehicleFormValues> | undefined {
  if (!vehicle) return undefined;
  const duplicating = mode === 'duplicate';
  return {
    license_plate: duplicating ? '' : vehicle.license_plate,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    vehicle_type: vehicle.vehicle_type,
    purchase_date: vehicle.purchase_date?.slice(0, 10),
    fuel_type: vehicle.fuel_type,
    color: vehicle.color ?? '#3b82f6',
    vin: duplicating ? '' : vehicle.vin ?? '',
    status: duplicating ? 'active' : (vehicle.status as VehicleFormValues['status']),
    registration_expiry: vehicle.registration_expiry?.slice(0, 10) ?? '',
    insurance_provider: vehicle.insurance_provider ?? '',
    service_interval: vehicle.service_interval,
    odometer: vehicle.odometer,
  };
}

export function VehicleModal({ open, mode, vehicle, onOpenChange, onSubmit }: VehicleModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-form-wide">
        <DialogHeader>
          <DialogTitle>{TITLES[mode]}</DialogTitle>
          <DialogDescription>{DESCRIPTIONS[mode]}</DialogDescription>
        </DialogHeader>
        <VehicleForm
          key={`${mode}-${vehicle?._id ?? 'new'}`}
          defaultValues={toFormValues(vehicle, mode)}
          onSubmit={async (values) => {
            await onSubmit(values);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
          submitLabel={mode === 'edit' ? 'Save changes' : 'Add vehicle'}
        />
      </DialogContent>
    </Dialog>
  );
}