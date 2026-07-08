// frontend/modules/organizations/components/settings/TaxSection.tsx
'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UseMutationResult } from '@tanstack/react-query';
import { taxSettingsSchema, TaxSettingsFormValues } from '../../schemas';
import type { Organization } from '../../types';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Switch } from '@/frontend/shared/ui/forms/switch';
import { toast } from 'sonner';

interface Props {
  organization: Organization;
  mutation: UseMutationResult<unknown, unknown, TaxSettingsFormValues>;
}

type OrganizationWithTax = Organization & {
  taxSettings?: TaxSettingsFormValues;
};

export function TaxSection({ organization, mutation }: Props) {
  const existing = (organization as OrganizationWithTax).taxSettings;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isDirty },
  } = useForm<TaxSettingsFormValues>({
    resolver: zodResolver(taxSettingsSchema),
    defaultValues: {
      taxId: existing?.taxId || '',
      taxRate: existing?.taxRate ?? 0,
      taxInclusivePricing: existing?.taxInclusivePricing ?? false,
    },
  });

  const onSubmit = (data: TaxSettingsFormValues) => {
    mutation.mutate(data, {
      onSuccess: () => toast.success('Tax settings updated'),
      onError: () => toast.error('Failed to update tax settings'),
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="form-section max-w-form-narrow">
      <div>
        <Label htmlFor="taxId" className="form-label">
          Tax ID / VAT number
        </Label>
        <Input id="taxId" className="input-base" {...register('taxId')} placeholder="e.g. VAT123456789" />
        {errors.taxId && <p className="form-error">{errors.taxId.message}</p>}
      </div>

      <div>
        <Label htmlFor="taxRate" className="form-label form-required">
          Tax rate (%)
        </Label>
        <Input
          id="taxRate"
          type="number"
          step="0.01"
          min={0}
          max={100}
          className="input-base"
          {...register('taxRate', { valueAsNumber: true })}
        />
        {errors.taxRate && <p className="form-error">{errors.taxRate.message}</p>}
        <p className="form-hint">Applied to invoices and reports unless overridden per item.</p>
      </div>

      <div className="flex items-center justify-between p-3 border rounded-md border-border">
        <div>
          <Label htmlFor="taxInclusivePricing" className="form-label mb-0.5!">
            Tax-inclusive pricing
          </Label>
          <p className="form-hint mt-0!">Prices already include tax rather than adding it at checkout.</p>
        </div>
        <Controller
          control={control}
          name="taxInclusivePricing"
          render={({ field }) => (
            <Switch id="taxInclusivePricing" checked={field.value} onCheckedChange={field.onChange} />
          )}
        />
      </div>

      <Button type="submit" disabled={!isDirty || mutation.isPending}>
        {mutation.isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}