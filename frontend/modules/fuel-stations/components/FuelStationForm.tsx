// frontend/modules/fuel-stations/components/FuelStationForm.tsx

'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Textarea } from '@/frontend/shared/ui/forms/textarea';
import { Checkbox } from '@/frontend/shared/ui/forms/checkbox';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Spinner } from '@/frontend/shared/ui/feedback/spinner';
import { fuelStationFormSchema, type FuelStationFormValues } from '../schemas';

interface FuelStationFormProps {
  defaultValues?: Partial<FuelStationFormValues>;
  onSubmit: (values: FuelStationFormValues) => Promise<unknown>;
  onCancel: () => void;
  submitLabel?: string;
}

const FALLBACK_DEFAULTS: FuelStationFormValues = {
  name: '',
  brand: '',
  address: '',
  city: '',
  country: '',
  phone: '',
  notes: '',
  isActive: true,
};

export function FuelStationForm({ defaultValues, onSubmit, onCancel, submitLabel = 'Save station' }: FuelStationFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FuelStationFormValues>({
    resolver: zodResolver(fuelStationFormSchema),
    defaultValues: { ...FALLBACK_DEFAULTS, ...defaultValues },
  });

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name" className="form-label form-required">Station name</Label>
          <Input id="name" className={errors.name ? 'input-error' : undefined} {...register('name')} />
          {errors.name && <p className="form-error" role="alert">{errors.name.message}</p>}
        </div>
        <div>
          <Label htmlFor="brand" className="form-label">Brand / network</Label>
          <Input id="brand" placeholder="e.g. Total, Puma, Engen" {...register('brand')} />
        </div>
        <div>
          <Label htmlFor="address" className="form-label">Address</Label>
          <Input id="address" {...register('address')} />
        </div>
        <div>
          <Label htmlFor="city" className="form-label">City</Label>
          <Input id="city" {...register('city')} />
        </div>
        <div>
          <Label htmlFor="country" className="form-label">Country</Label>
          <Input id="country" {...register('country')} />
        </div>
        <div>
          <Label htmlFor="phone" className="form-label">Phone</Label>
          <Input id="phone" {...register('phone')} />
        </div>
      </div>

      <div>
        <Label htmlFor="notes" className="form-label">Notes</Label>
        <Textarea id="notes" rows={2} {...register('notes')} />
      </div>

      <div className="flex items-center gap-2">
        <Controller
          control={control}
          name="isActive"
          render={({ field }) => <Checkbox id="isActive" checked={field.value} onCheckedChange={field.onChange} />}
        />
        <Label htmlFor="isActive" className="form-label mb-0!">Active</Label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Spinner className="w-4 h-4 mr-2" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}