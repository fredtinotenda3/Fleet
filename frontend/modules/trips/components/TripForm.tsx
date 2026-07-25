// frontend/modules/trips/components/TripForm.tsx

'use client';

import { useEffect } from 'react';
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
import { tripFormSchema, type TripFormValues } from '../schemas';
import { TRIP_MODES } from '../types';
import { tripModeLabel } from '../utils';

interface TripFormProps {
  defaultValues?: Partial<TripFormValues>;
  unitOptions: { value: string; label: string }[];
  onSubmit: (values: TripFormValues) => Promise<unknown>;
  onCancel: () => void;
  submitLabel?: string;
}

const FALLBACK_DEFAULTS: TripFormValues = {
  license_plate: '',
  date: new Date().toISOString().slice(0, 10),
  unit_id: '',
  mode: 'distance',
  trip_distance: undefined,
  start_odometer: undefined,
  end_odometer: undefined,
  notes: '',
  start_location: '',
  end_location: '',
  driver_id: '',
};

/**
 * FIX (license plate blank on edit, same root cause as Fuel/Expense
 * forms): a plain `{ ...FALLBACK_DEFAULTS, ...defaultValues }` spread
 * does not skip explicit `null`/`undefined` values -- if a trip record
 * ever has `license_plate: null` (or any other field null), it would
 * silently clobber FALLBACK_DEFAULTS' safe `''` and the field renders
 * blank. TripForm was the one form of the three that didn't already
 * guard against this.
 */
function cleanDefaults(values?: Partial<TripFormValues>): Partial<TripFormValues> {
  if (!values) return {};
  const out: Partial<TripFormValues> = {};
  (Object.keys(values) as Array<keyof TripFormValues>).forEach((key) => {
    const v = values[key];
    if (v !== null && v !== undefined) {
      (out as any)[key] = v;
    }
  });
  return out;
}

export function TripForm({
  defaultValues,
  unitOptions,
  onSubmit,
  onCancel,
  submitLabel = 'Log trip',
}: TripFormProps) {
  const cleanedDefaults = cleanDefaults(defaultValues);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<TripFormValues>({
    resolver: zodResolver(tripFormSchema),
    defaultValues: { ...FALLBACK_DEFAULTS, ...cleanedDefaults },
  });

  useEffect(() => {
    reset({ ...FALLBACK_DEFAULTS, ...cleanDefaults(defaultValues) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValues]);

  const mode = watch('mode');

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
            /**
             * FIX: `unit_id` below is a controlled Controller/Select, so
             * reset() always keeps it in sync. `license_plate` is a
             * plain register()-only uncontrolled input with no
             * `defaultValue` attribute of its own -- it depended
             * entirely on RHF's initial mount + reset() to push a value
             * into the DOM node via ref. Adding an explicit
             * `defaultValue` here (same pattern already used for the
             * Fuel form's `date` field) guarantees the field shows the
             * record's plate on first paint even if register()'s
             * ref-based update is delayed or the surrounding modal
             * remounts with a fresh key before reset() runs.
             */
            defaultValue={cleanedDefaults.license_plate ?? ''}
            {...register('license_plate')}
          />
          {errors.license_plate && <p className="form-error" role="alert">{errors.license_plate.message}</p>}
        </div>

        <div>
          <Label htmlFor="date" className="form-label form-required">Date</Label>
          <Input
            id="date"
            type="date"
            className={errors.date ? 'input-error' : undefined}
            defaultValue={cleanedDefaults.date ?? new Date().toISOString().slice(0, 10)}
            {...register('date')}
          />
          {errors.date && <p className="form-error" role="alert">{errors.date.message}</p>}
        </div>

        <div>
          <Label htmlFor="mode" className="form-label form-required">Trip mode</Label>
          <Controller
            control={control}
            name="mode"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="mode" className="w-full">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  {TRIP_MODES.map((m) => (
                    <SelectItem key={m} value={m}>{tripModeLabel(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div>
          <Label htmlFor="unit_id" className="form-label form-required">Distance unit</Label>
          <Controller
            control={control}
            name="unit_id"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="unit_id" className="w-full">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {unitOptions.map((u) => (
                    <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.unit_id && <p className="form-error" role="alert">{errors.unit_id.message}</p>}
        </div>

        {mode === 'distance' ? (
          <div>
            <Label htmlFor="trip_distance" className="form-label form-required">Trip distance</Label>
            <Input
              id="trip_distance"
              type="number"
              step="0.01"
              className={errors.trip_distance ? 'input-error' : undefined}
              {...register('trip_distance', numericFieldOptions)}
            />
            {errors.trip_distance && <p className="form-error" role="alert">{errors.trip_distance.message}</p>}
          </div>
        ) : (
          <>
            <div>
              <Label htmlFor="start_odometer" className="form-label form-required">Start odometer</Label>
              <Input
                id="start_odometer"
                type="number"
                step="0.01"
                className={errors.start_odometer ? 'input-error' : undefined}
                {...register('start_odometer', numericFieldOptions)}
              />
              {errors.start_odometer && <p className="form-error" role="alert">{errors.start_odometer.message}</p>}
            </div>
            <div>
              <Label htmlFor="end_odometer" className="form-label form-required">End odometer</Label>
              <Input
                id="end_odometer"
                type="number"
                step="0.01"
                className={errors.end_odometer ? 'input-error' : undefined}
                {...register('end_odometer', numericFieldOptions)}
              />
              {errors.end_odometer && <p className="form-error" role="alert">{errors.end_odometer.message}</p>}
            </div>
          </>
        )}

        <div>
          <Label htmlFor="driver_id" className="form-label">Driver ID</Label>
          <Input
            id="driver_id"
            defaultValue={cleanedDefaults.driver_id ?? ''}
            {...register('driver_id')}
          />
        </div>

        <div>
          <Label htmlFor="start_location" className="form-label">Start location</Label>
          <Input
            id="start_location"
            defaultValue={cleanedDefaults.start_location ?? ''}
            {...register('start_location')}
          />
        </div>

        <div>
          <Label htmlFor="end_location" className="form-label">End location</Label>
          <Input
            id="end_location"
            defaultValue={cleanedDefaults.end_location ?? ''}
            {...register('end_location')}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="notes" className="form-label">Notes</Label>
        <Textarea id="notes" rows={3} defaultValue={cleanedDefaults.notes ?? ''} {...register('notes')} />
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