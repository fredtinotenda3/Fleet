// frontend/modules/organizations/components/settings/RegionalSection.tsx
'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UseMutationResult } from '@tanstack/react-query';
import { regionalSettingsSchema, RegionalSettingsFormValues } from '../../schemas';
import type { Organization } from '../../types';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/frontend/shared/ui/forms/select';
import { toast } from 'sonner';
import { TIMEZONE_OPTIONS, CURRENCY_OPTIONS, LANGUAGE_OPTIONS } from '../../utils';

interface Props {
  organization: Organization;
  mutation: UseMutationResult<unknown, unknown, RegionalSettingsFormValues>;
}

export function RegionalSection({ organization, mutation }: Props) {
  const {
    handleSubmit,
    control,
    formState: { errors, isDirty },
  } = useForm<RegionalSettingsFormValues>({
    resolver: zodResolver(regionalSettingsSchema),
    defaultValues: {
      timezone: organization.settings.timezone,
      currency: organization.settings.currency,
      dateFormat: organization.settings.dateFormat as RegionalSettingsFormValues['dateFormat'],
      language: organization.settings.language,
      distanceUnit: organization.settings.distanceUnit,
      volumeUnit: organization.settings.volumeUnit,
    },
  });

  const onSubmit = (data: RegionalSettingsFormValues) => {
    mutation.mutate(data, {
      onSuccess: () => toast.success('Regional settings updated'),
      onError: () => toast.error('Failed to update regional settings'),
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="form-section max-w-form-narrow">
      <div>
        <Label htmlFor="timezone" className="form-label form-required">
          Time zone
        </Label>
        <Controller
          control={control}
          name="timezone"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="timezone" className="input-base">
                <SelectValue placeholder="Select time zone" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONE_OPTIONS.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.timezone && <p className="form-error">{errors.timezone.message}</p>}
      </div>

      <div>
        <Label htmlFor="currency" className="form-label form-required">
          Currency
        </Label>
        <Controller
          control={control}
          name="currency"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="currency" className="input-base">
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                {CURRENCY_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.currency && <p className="form-error">{errors.currency.message}</p>}
      </div>

      <div>
        <Label htmlFor="dateFormat" className="form-label form-required">
          Date format
        </Label>
        <Controller
          control={control}
          name="dateFormat"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="dateFormat" className="input-base">
                <SelectValue placeholder="Select date format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        {errors.dateFormat && <p className="form-error">{errors.dateFormat.message}</p>}
      </div>

      <div>
        <Label htmlFor="language" className="form-label form-required">
          Language
        </Label>
        <Controller
          control={control}
          name="language"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="language" className="input-base">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.language && <p className="form-error">{errors.language.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="distanceUnit" className="form-label form-required">
            Distance unit
          </Label>
          <Controller
            control={control}
            name="distanceUnit"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="distanceUnit" className="input-base">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="km">Kilometers</SelectItem>
                  <SelectItem value="mi">Miles</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          {errors.distanceUnit && <p className="form-error">{errors.distanceUnit.message}</p>}
        </div>

        <div>
          <Label htmlFor="volumeUnit" className="form-label form-required">
            Volume unit
          </Label>
          <Controller
            control={control}
            name="volumeUnit"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="volumeUnit" className="input-base">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="L">Liters</SelectItem>
                  <SelectItem value="gal">Gallons</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          {errors.volumeUnit && <p className="form-error">{errors.volumeUnit.message}</p>}
        </div>
      </div>

      <Button type="submit" disabled={!isDirty || mutation.isPending}>
        {mutation.isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}