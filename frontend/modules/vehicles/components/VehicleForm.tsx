// frontend/modules/vehicles/components/VehicleForm.tsx

'use client';

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Spinner } from '@/frontend/shared/ui/feedback/spinner';
import { vehicleFormSchema, type VehicleFormValues } from '../schemas';
import { VEHICLE_TYPE_OPTIONS, FUEL_TYPE_OPTIONS } from '../utils';
import { VEHICLE_STATUSES } from '../types';

interface VehicleFormProps {
  defaultValues?: Partial<VehicleFormValues>;
  onSubmit: (values: VehicleFormValues) => Promise<unknown>;
  onCancel: () => void;
  submitLabel?: string;
}

const FALLBACK_DEFAULTS: VehicleFormValues = {
  license_plate: '',
  make: '',
  model: '',
  year: new Date().getFullYear(),
  vehicle_type: VEHICLE_TYPE_OPTIONS[0],
  purchase_date: new Date().toISOString().slice(0, 10),
  fuel_type: FUEL_TYPE_OPTIONS[0],
  color: '#3b82f6',
  vin: '',
  status: 'active',
  registration_expiry: '',
  insurance_provider: '',
  service_interval: 10000,
  odometer: 0,
};

export function VehicleForm({ defaultValues, onSubmit, onCancel, submitLabel = 'Save vehicle' }: VehicleFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: { ...FALLBACK_DEFAULTS, ...defaultValues },
  });

  useEffect(() => {
    reset({ ...FALLBACK_DEFAULTS, ...defaultValues });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValues]);

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
  });

  const numericFieldOptions = {
    setValueAs: (v: unknown) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="license_plate" className="form-label form-required">
            License plate
          </Label>
          <Input
            id="license_plate"
            className={errors.license_plate ? 'input-error' : undefined}
            {...register('license_plate')}
          />
          {errors.license_plate && <p className="form-error" role="alert">{errors.license_plate.message}</p>}
        </div>

        <div>
          <Label htmlFor="vin" className="form-label">VIN</Label>
          <Input id="vin" maxLength={17} className={errors.vin ? 'input-error' : undefined} {...register('vin')} />
          {errors.vin && <p className="form-error" role="alert">{errors.vin.message}</p>}
        </div>

        <div>
          <Label htmlFor="make" className="form-label form-required">Make</Label>
          <Input id="make" className={errors.make ? 'input-error' : undefined} {...register('make')} />
          {errors.make && <p className="form-error" role="alert">{errors.make.message}</p>}
        </div>

        <div>
          <Label htmlFor="model" className="form-label form-required">Model</Label>
          <Input id="model" className={errors.model ? 'input-error' : undefined} {...register('model')} />
          {errors.model && <p className="form-error" role="alert">{errors.model.message}</p>}
        </div>

        <div>
          <Label htmlFor="year" className="form-label form-required">Year</Label>
          <Input
            id="year"
            type="number"
            className={errors.year ? 'input-error' : undefined}
            {...register('year', { setValueAs: (v) => Number(v) })}
          />
          {errors.year && <p className="form-error" role="alert">{errors.year.message}</p>}
        </div>

        <div>
          <Label htmlFor="purchase_date" className="form-label form-required">Purchase date</Label>
          <Input
            id="purchase_date"
            type="date"
            className={errors.purchase_date ? 'input-error' : undefined}
            {...register('purchase_date')}
          />
          {errors.purchase_date && <p className="form-error" role="alert">{errors.purchase_date.message}</p>}
        </div>

        <div>
          <Label htmlFor="vehicle_type" className="form-label form-required">Vehicle type</Label>
          <Controller
            control={control}
            name="vehicle_type"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="vehicle_type" className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {VEHICLE_TYPE_OPTIONS.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.vehicle_type && <p className="form-error" role="alert">{errors.vehicle_type.message}</p>}
        </div>

        <div>
          <Label htmlFor="fuel_type" className="form-label form-required">Fuel type</Label>
          <Controller
            control={control}
            name="fuel_type"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="fuel_type" className="w-full">
                  <SelectValue placeholder="Select fuel type" />
                </SelectTrigger>
                <SelectContent>
                  {FUEL_TYPE_OPTIONS.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.fuel_type && <p className="form-error" role="alert">{errors.fuel_type.message}</p>}
        </div>

        <div>
          <Label htmlFor="status" className="form-label form-required">Status</Label>
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="status" className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {VEHICLE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status} className="capitalize">{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div>
          <Label htmlFor="color" className="form-label">Color</Label>
          <Input id="color" type="color" className="w-16 p-1 h-9" {...register('color')} />
        </div>

        <div>
          <Label htmlFor="odometer" className="form-label">Odometer (km)</Label>
          <Input
            id="odometer"
            type="number"
            className={errors.odometer ? 'input-error' : undefined}
            {...register('odometer', numericFieldOptions)}
          />
          {errors.odometer && <p className="form-error" role="alert">{errors.odometer.message}</p>}
        </div>

        <div>
          <Label htmlFor="service_interval" className="form-label">Service interval (km)</Label>
          <Input
            id="service_interval"
            type="number"
            className={errors.service_interval ? 'input-error' : undefined}
            {...register('service_interval', numericFieldOptions)}
          />
          {errors.service_interval && <p className="form-error" role="alert">{errors.service_interval.message}</p>}
        </div>

        <div>
          <Label htmlFor="registration_expiry" className="form-label">Registration expiry</Label>
          <Input id="registration_expiry" type="date" {...register('registration_expiry')} />
        </div>

        <div>
          <Label htmlFor="insurance_provider" className="form-label">Insurance provider</Label>
          <Input id="insurance_provider" {...register('insurance_provider')} />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Spinner className="w-4 h-4 mr-2" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}