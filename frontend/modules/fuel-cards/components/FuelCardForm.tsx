// frontend/modules/fuel-cards/components/FuelCardForm.tsx

'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Textarea } from '@/frontend/shared/ui/forms/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Spinner } from '@/frontend/shared/ui/feedback/spinner';
import { fuelCardFormSchema, type FuelCardFormValues } from '../schemas';
import { FUEL_CARD_STATUSES } from '../types';
import { useVehiclesList } from '@/frontend/modules/vehicles/hooks/useVehicles';

const CURRENCIES = ['USD', 'ZWG', 'ZAR', 'EUR', 'GBP'];

interface FuelCardFormProps {
  defaultValues?: Partial<FuelCardFormValues>;
  onSubmit: (values: FuelCardFormValues) => Promise<unknown>;
  onCancel: () => void;
  submitLabel?: string;
}

const FALLBACK_DEFAULTS: FuelCardFormValues = {
  card_last4: '',
  provider: '',
  currency: 'USD',
  license_plate: '',
  monthly_limit: undefined,
  status: 'active',
  expiry_date: '',
  notes: '',
};

export function FuelCardForm({ defaultValues, onSubmit, onCancel, submitLabel = 'Save card' }: FuelCardFormProps) {
  const { data: vehicles } = useVehiclesList({ limit: 1000 });

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FuelCardFormValues>({
    resolver: zodResolver(fuelCardFormSchema),
    defaultValues: { ...FALLBACK_DEFAULTS, ...defaultValues },
  });

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="provider" className="form-label form-required">Provider</Label>
          <Input id="provider" placeholder="e.g. Puma Energy, Zuva" className={errors.provider ? 'input-error' : undefined} {...register('provider')} />
          {errors.provider && <p className="form-error" role="alert">{errors.provider.message}</p>}
        </div>
        <div>
          <Label htmlFor="card_last4" className="form-label form-required">Card last 4 digits</Label>
          <Input
            id="card_last4"
            maxLength={4}
            placeholder="1234"
            className={errors.card_last4 ? 'input-error' : undefined}
            {...register('card_last4')}
          />
          {errors.card_last4 && <p className="form-error" role="alert">{errors.card_last4.message}</p>}
          <p className="form-hint">Only the last 4 digits are stored, never the full card number.</p>
        </div>
        <div>
          <Label htmlFor="currency" className="form-label form-required">Currency</Label>
          <Controller
            control={control}
            name="currency"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="currency" className="w-full"><SelectValue placeholder="Currency" /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div>
          <Label htmlFor="status" className="form-label form-required">Status</Label>
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="status" className="w-full"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  {FUEL_CARD_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div>
          <Label htmlFor="license_plate" className="form-label">Assigned vehicle</Label>
          <Controller
            control={control}
            name="license_plate"
            render={({ field }) => (
              <Select value={field.value || ''} onValueChange={field.onChange}>
                <SelectTrigger id="license_plate" className="w-full"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {vehicles?.data?.map((v) => (
                    <SelectItem key={v._id} value={v.license_plate}>{v.license_plate} - {v.make} {v.model}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div>
          <Label htmlFor="monthly_limit" className="form-label">Monthly limit</Label>
          <Input
            id="monthly_limit"
            type="number"
            step="0.01"
            {...register('monthly_limit', {
              setValueAs: (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
            })}
          />
        </div>
        <div>
          <Label htmlFor="expiry_date" className="form-label">Expiry date</Label>
          <Input id="expiry_date" type="date" {...register('expiry_date')} />
        </div>
      </div>

      <div>
        <Label htmlFor="notes" className="form-label">Notes</Label>
        <Textarea id="notes" rows={2} {...register('notes')} />
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