// frontend/modules/dispatch/components/AssignDispatchForm.tsx
//
// POST /api/dispatch/[id]/assign only accepts { driverId, vehicleId }
// (dispatch.controller.ts's assign()), both required -- there is no
// partial assignment, unlike WorkOrder's optional bay. Follows the same
// react-hook-form + Controller pattern as AssignMechanicForm.tsx, reusing
// the existing DriverSelect and the new VehicleSelect component (see
// that file's header for why a new one was needed).

'use client';

import { useForm, Controller } from 'react-hook-form';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { DriverSelect } from '@/frontend/modules/drivers/components/DriverSelect';
import { VehicleSelect } from '@/frontend/modules/vehicles/components/VehicleSelect';
import type { AssignDispatchPayload } from '../types';

interface AssignDispatchFormValues {
  driverId: string;
  vehicleId: string;
}

interface AssignDispatchFormProps {
  onSubmit: (values: AssignDispatchPayload) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function AssignDispatchForm({ onSubmit, onCancel, isSubmitting }: AssignDispatchFormProps) {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AssignDispatchFormValues>({
    defaultValues: { driverId: '', vehicleId: '' },
  });

  async function handleFormSubmit(values: AssignDispatchFormValues) {
    await onSubmit({ driverId: values.driverId, vehicleId: values.vehicleId });
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="vehicleId">Vehicle *</Label>
        <Controller
          control={control}
          name="vehicleId"
          rules={{ required: 'Select a vehicle to assign' }}
          render={({ field }) => (
            <VehicleSelect
              id="vehicleId"
              value={field.value}
              onChange={field.onChange}
              allowUnassigned={false}
              placeholder="Select a vehicle"
            />
          )}
        />
        {errors.vehicleId && <p className="text-xs text-destructive">{errors.vehicleId.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="driverId">Driver *</Label>
        <Controller
          control={control}
          name="driverId"
          rules={{ required: 'Select a driver to assign' }}
          render={({ field }) => (
            <DriverSelect
              id="driverId"
              value={field.value}
              onChange={field.onChange}
              allowUnassigned={false}
              placeholder="Select a driver"
            />
          )}
        />
        {errors.driverId && <p className="text-xs text-destructive">{errors.driverId.message}</p>}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? 'Assigning...' : 'Assign'}
        </Button>
      </div>
    </form>
  );
}
