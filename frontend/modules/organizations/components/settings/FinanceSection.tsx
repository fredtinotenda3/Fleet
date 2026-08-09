// frontend/modules/organizations/components/settings/FinanceSection.tsx
//
// Organization Settings -> Finance. Same shape as TaxSection alongside it:
// react-hook-form + zodResolver, a mutation passed in from the page, and
// toast on success/failure.
//
// ONE DELIBERATE DIFFERENCE from its siblings. Every other section reads
// its current values off the `organization` object and writes through
// organizationApi.update*(organizationId, ...). Finance settings do not
// live on that endpoint -- they are served by GET/PUT
// /api/finance/settings, which derives the organization from the caller's
// tenant context server-side and is gated on FINANCE_MANAGE rather than
// ORG_MANAGE. So this section takes its data from that endpoint instead of
// from `organization`, and takes no organizationId at all. Routing it
// through the organization endpoint would have meant a backend change and
// would have handed reporting-currency control to every ORG_MANAGE holder.

'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import {
  financeSettingsSchema,
  type FinanceSettingsFormValues,
} from '../../schemas';
import {
  FX_POLICY_LABELS,
  DEPRECIATION_METHOD_LABELS,
  type FinanceSettingsResponse,
  type OrganizationFinanceSettings,
} from '@/frontend/modules/finance/types';

interface Props {
  settings: FinanceSettingsResponse | undefined;
  mutation: UseMutationResult<{ settings: OrganizationFinanceSettings }, unknown, OrganizationFinanceSettings>;
}

export function FinanceSection({ settings, mutation }: Props) {
  const resolved = settings?.resolved;
  const saved = settings?.saved;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isDirty },
  } = useForm<FinanceSettingsFormValues>({
    resolver: zodResolver(financeSettingsSchema),
    // Defaults come from `resolved`, not `saved`, so an unconfigured tenant
    // sees the values actually in force rather than empty fields -- and the
    // banner below tells them those values are defaults, not choices.
    values: {
      reportingCurrency: resolved?.reportingCurrency ?? '',
      fxPolicy: resolved?.fxPolicy ?? 'transaction-date',
      glToleranceAmount: resolved?.glToleranceAmount ?? 0,
      depreciationMethod: resolved?.depreciationDefaults?.method ?? 'straight-line',
      depreciationUsefulLifeMonths: resolved?.depreciationDefaults?.usefulLifeMonths ?? undefined,
    },
  });

  const onSubmit = (data: FinanceSettingsFormValues) => {
    const payload: OrganizationFinanceSettings = {
      reportingCurrency: data.reportingCurrency.toUpperCase(),
      fxPolicy: data.fxPolicy,
      glToleranceAmount: data.glToleranceAmount,
      depreciationDefaults: {
        method: data.depreciationMethod,
        usefulLifeMonths: data.depreciationUsefulLifeMonths,
      },
    };

    mutation.mutate(payload, {
      onSuccess: () => toast.success('Finance settings updated'),
      onError: () => toast.error('Failed to update finance settings'),
    });
  };

  const currencyChanging =
    Boolean(saved?.reportingCurrency) && saved?.reportingCurrency !== resolved?.reportingCurrency;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="form-section max-w-form-narrow">
      {resolved?.usingDefaults && (
        <div className="p-3 border rounded-md border-border">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Not configured</Badge>
          </div>
          <p className="form-hint mt-2!">
            Nothing has been saved yet, so the values below are platform defaults (with the reporting currency
            inherited from your organization currency). Save to confirm them explicitly.
          </p>
        </div>
      )}

      <div>
        <Label htmlFor="reportingCurrency" className="form-label form-required">
          Reporting currency
        </Label>
        <Input
          id="reportingCurrency"
          className="input-base"
          maxLength={3}
          placeholder="e.g. USD"
          {...register('reportingCurrency')}
        />
        {errors.reportingCurrency && <p className="form-error">{errors.reportingCurrency.message}</p>}
        <p className="form-hint">
          The currency every cost figure and the GL reconciliation are reported in. Existing postings keep the
          currency they were written under, so changing this leaves any period spanning the change unable to be
          totalled until those postings are reversed or re-posted.
        </p>
        {currencyChanging && (
          <p className="form-hint">Currently in force: {resolved?.reportingCurrency}.</p>
        )}
      </div>

      <div>
        <Label htmlFor="fxPolicy" className="form-label form-required">
          FX policy
        </Label>
        <Controller
          control={control}
          name="fxPolicy"
          render={({ field }) => (
            <select id="fxPolicy" className="input-base" value={field.value} onChange={field.onChange}>
              {(Object.keys(FX_POLICY_LABELS) as Array<keyof typeof FX_POLICY_LABELS>).map((value) => (
                <option key={value} value={value}>
                  {FX_POLICY_LABELS[value]}
                </option>
              ))}
            </select>
          )}
        />
        {errors.fxPolicy && <p className="form-error">{errors.fxPolicy.message}</p>}
        <p className="form-hint">
          Transaction-date is the most accurate and the most volatile period to period. Period-average is smoother
          and matches how many close processes work.
        </p>
      </div>

      <div>
        <Label htmlFor="glToleranceAmount" className="form-label">
          GL match tolerance
        </Label>
        <Input
          id="glToleranceAmount"
          type="number"
          step="0.01"
          min={0}
          className="input-base"
          {...register('glToleranceAmount', { valueAsNumber: true })}
        />
        {errors.glToleranceAmount && <p className="form-error">{errors.glToleranceAmount.message}</p>}
        <p className="form-hint">
          A reconciliation line counts as matched when the variance is within this amount. Zero requires an exact
          match — a tolerance you did not choose should never quietly mark a gap as reconciled.
        </p>
      </div>

      <div>
        <Label htmlFor="depreciationMethod" className="form-label form-required">
          Default depreciation method
        </Label>
        <Controller
          control={control}
          name="depreciationMethod"
          render={({ field }) => (
            <select
              id="depreciationMethod"
              className="input-base"
              value={field.value}
              onChange={field.onChange}
            >
              {(Object.keys(DEPRECIATION_METHOD_LABELS) as Array<keyof typeof DEPRECIATION_METHOD_LABELS>).map(
                (value) => (
                  <option key={value} value={value}>
                    {DEPRECIATION_METHOD_LABELS[value]}
                  </option>
                )
              )}
            </select>
          )}
        />
        {errors.depreciationMethod && <p className="form-error">{errors.depreciationMethod.message}</p>}
        <p className="form-hint">
          Applied to new vehicle depreciation profiles that don&apos;t set their own method. Changing this does not
          restate existing profiles or any depreciation already posted.
        </p>
      </div>

      <div>
        <Label htmlFor="depreciationUsefulLifeMonths" className="form-label">
          Default useful life (months)
        </Label>
        <Input
          id="depreciationUsefulLifeMonths"
          type="number"
          min={1}
          max={1200}
          className="input-base"
          {...register('depreciationUsefulLifeMonths', {
            setValueAs: (value) => (value === '' || value == null ? undefined : Number(value)),
          })}
        />
        {errors.depreciationUsefulLifeMonths && (
          <p className="form-error">{errors.depreciationUsefulLifeMonths.message}</p>
        )}
      </div>

      <Button type="submit" disabled={!isDirty || mutation.isPending}>
        {mutation.isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}