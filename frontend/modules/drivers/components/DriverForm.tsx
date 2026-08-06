// frontend/modules/drivers/components/DriverForm.tsx

'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Textarea } from '@/frontend/shared/ui/forms/textarea';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Spinner } from '@/frontend/shared/ui/feedback/spinner';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/frontend/shared/ui/forms/select';
import { driverFormSchema, type DriverFormValues } from '../schemas';
import { DRIVER_STATUSES } from '../types';

interface DriverFormProps {
  defaultValues?: Partial<DriverFormValues>;
  onSubmit: (values: DriverFormValues) => Promise<unknown>;
  onCancel: () => void;
  submitLabel?: string;
}

const FALLBACK_DEFAULTS: DriverFormValues = {
  name: '',
  email: '',
  phone: '',
  driver_code: '',
  license_number: '',
  license_expiry: '',
  status: 'active',
  notes: '',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  suspended: 'Suspended',
};

export function DriverForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel = 'Save driver',
}: DriverFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DriverFormValues>({
    resolver: zodResolver(driverFormSchema),
    defaultValues: { ...FALLBACK_DEFAULTS, ...defaultValues },
  });

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name" className="form-label form-required">
            Full name
          </Label>
          <Input
            id="name"
            autoComplete="name"
            aria-invalid={Boolean(errors.name)}
            className={errors.name ? 'input-error' : undefined}
            {...register('name')}
          />
          {errors.name && (
            <p className="form-error" role="alert">
              {errors.name.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="driver_code" className="form-label">
            Driver code
          </Label>
          <Input
            id="driver_code"
            placeholder="Badge or staff number"
            aria-invalid={Boolean(errors.driver_code)}
            className={errors.driver_code ? 'input-error' : undefined}
            {...register('driver_code')}
          />
          {errors.driver_code && (
            <p className="form-error" role="alert">
              {errors.driver_code.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="email" className="form-label">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            className={errors.email ? 'input-error' : undefined}
            {...register('email')}
          />
          {errors.email && (
            <p className="form-error" role="alert">
              {errors.email.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="phone" className="form-label">
            Phone
          </Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            aria-invalid={Boolean(errors.phone)}
            className={errors.phone ? 'input-error' : undefined}
            {...register('phone')}
          />
          {errors.phone && (
            <p className="form-error" role="alert">
              {errors.phone.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="license_number" className="form-label">
            Licence number
          </Label>
          <Input
            id="license_number"
            aria-invalid={Boolean(errors.license_number)}
            className={errors.license_number ? 'input-error' : undefined}
            {...register('license_number')}
          />
          {errors.license_number && (
            <p className="form-error" role="alert">
              {errors.license_number.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="license_expiry" className="form-label">
            Licence expiry
          </Label>
          <Input
            id="license_expiry"
            type="date"
            aria-invalid={Boolean(errors.license_expiry)}
            className={errors.license_expiry ? 'input-error' : undefined}
            {...register('license_expiry')}
          />
          {errors.license_expiry && (
            <p className="form-error" role="alert">
              {errors.license_expiry.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="status" className="form-label">
            Status
          </Label>
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {DRIVER_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABELS[status] ?? status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="notes" className="form-label">
          Notes
        </Label>
        <Textarea
          id="notes"
          rows={3}
          aria-invalid={Boolean(errors.notes)}
          className={errors.notes ? 'input-error' : undefined}
          {...register('notes')}
        />
        {errors.notes && (
          <p className="form-error" role="alert">
            {errors.notes.message}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Spinner className="h-3.5 w-3.5" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export default DriverForm;
