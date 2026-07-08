// frontend/modules/organizations/components/settings/BusinessHoursSection.tsx
'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UseMutationResult } from '@tanstack/react-query';
import { businessHoursSchema, BusinessHoursFormValues } from '../../schemas';
import type { Organization } from '../../types';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Switch } from '@/frontend/shared/ui/forms/switch';
import { Input } from '@/frontend/shared/ui/forms/input';
import { toast } from 'sonner';

interface Props {
  organization: Organization;
  mutation: UseMutationResult<unknown, unknown, BusinessHoursFormValues>;
}

type OrganizationWithHours = Organization & {
  businessHours?: BusinessHoursFormValues;
};

const DAYS: { key: keyof BusinessHoursFormValues; label: string }[] = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

const DEFAULT_DAY = { enabled: true, openTime: '08:00', closeTime: '17:00' };
const DEFAULT_WEEKEND = { enabled: false, openTime: '08:00', closeTime: '13:00' };

export function BusinessHoursSection({ organization, mutation }: Props) {
  const existing = (organization as OrganizationWithHours).businessHours;

  const {
    handleSubmit,
    control,
    watch,
    formState: { isDirty },
  } = useForm<BusinessHoursFormValues>({
    resolver: zodResolver(businessHoursSchema),
    defaultValues: existing || {
      monday: DEFAULT_DAY,
      tuesday: DEFAULT_DAY,
      wednesday: DEFAULT_DAY,
      thursday: DEFAULT_DAY,
      friday: DEFAULT_DAY,
      saturday: DEFAULT_WEEKEND,
      sunday: DEFAULT_WEEKEND,
    },
  });

  const onSubmit = (data: BusinessHoursFormValues) => {
    mutation.mutate(data, {
      onSuccess: () => toast.success('Business hours updated'),
      onError: () => toast.error('Failed to update business hours'),
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="form-section max-w-form-wide">
      <p className="form-hint mt-0!">
        Set the hours your organization operates each day. Disabled days are treated as closed.
      </p>

      <div className="space-y-3">
        {DAYS.map(({ key, label }) => {
          const dayEnabled = watch(`${key}.enabled`);
          return (
            <div
              key={key}
              className="flex items-center gap-4 p-3 border rounded-md border-border"
            >
              <div className="flex items-center gap-3 w-36">
                <Controller
                  control={control}
                  name={`${key}.enabled`}
                  render={({ field }) => (
                    <Switch checked={field.value} onCheckedChange={field.onChange} id={`${key}-enabled`} />
                  )}
                />
                <Label htmlFor={`${key}-enabled`} className="form-label mb-0!">
                  {label}
                </Label>
              </div>

              <div className="flex items-center flex-1 gap-3">
                <Controller
                  control={control}
                  name={`${key}.openTime`}
                  render={({ field }) => (
                    <Input
                      type="time"
                      className="w-32 input-base"
                      disabled={!dayEnabled}
                      {...field}
                    />
                  )}
                />
                <span className="text-muted-foreground text-body-sm">to</span>
                <Controller
                  control={control}
                  name={`${key}.closeTime`}
                  render={({ field }) => (
                    <Input
                      type="time"
                      className="w-32 input-base"
                      disabled={!dayEnabled}
                      {...field}
                    />
                  )}
                />
                {!dayEnabled && <span className="text-caption text-muted-foreground">Closed</span>}
              </div>
            </div>
          );
        })}
      </div>

      <Button type="submit" disabled={!isDirty || mutation.isPending}>
        {mutation.isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}