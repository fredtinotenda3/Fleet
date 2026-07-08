// frontend/modules/organizations/components/advanced/AISettingsSection.tsx
'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Switch } from '@/frontend/shared/ui/forms/switch';
import { Input } from '@/frontend/shared/ui/forms/input';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { aiSettingsSchema, AISettingsFormValues } from '../../schemas/advanced.schema';
import { useUpdateAISettings } from '../../hooks/useAdvancedSettings';
import type { Organization } from '../../types';
import type { OrganizationAISettings } from '../../types/advanced.types';
import { DEFAULT_AI_SETTINGS } from './defaults';

type OrganizationWithAI = Organization & { aiSettings?: OrganizationAISettings };

interface Props {
  organization: Organization;
}

const MODEL_TOGGLES: { key: keyof AISettingsFormValues; label: string; hint: string }[] = [
  { key: 'predictiveMaintenance', label: 'Predictive maintenance', hint: 'Flag vehicles likely to need service before a fault occurs.' },
  { key: 'fuelFraudDetection', label: 'Fuel fraud detection', hint: 'Surface fuel logs with anomalous volume or price patterns.' },
  { key: 'driverRiskScoring', label: 'Driver risk scoring', hint: 'Score drivers on harsh braking, speeding, and incident history.' },
  { key: 'expenseAnomalyDetection', label: 'Expense anomaly detection', hint: 'Flag expense entries that deviate from historical norms.' },
];

export function AISettingsSection({ organization }: Props) {
  const mutation = useUpdateAISettings(organization._id!);
  const existing = (organization as OrganizationWithAI).aiSettings ?? DEFAULT_AI_SETTINGS;

  const { register, handleSubmit, control, watch, formState: { errors, isDirty } } =
    useForm<AISettingsFormValues>({
      resolver: zodResolver(aiSettingsSchema),
      defaultValues: existing,
    });

  const enabled = watch('enabled');

  const onSubmit = (data: AISettingsFormValues) => mutation.mutate(data);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-form-wide">
      <div className="flex items-center justify-between p-3 border rounded-md border-border">
        <div>
          <Label htmlFor="ai-enabled" className="form-label mb-0.5!">
            Enable AI Platform
          </Label>
          <p className="form-hint mt-0!">Master switch for every AI model below.</p>
        </div>
        <Controller
          control={control}
          name="enabled"
          render={({ field }) => (
            <Switch
              id="ai-enabled"
              checked={field.value as boolean}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </div>

      <div className="space-y-2">
        {MODEL_TOGGLES.map(({ key, label, hint }) => (
          <div
            key={key}
            className="flex items-center justify-between p-3 border rounded-md border-border disabled:opacity-50"
            style={{ opacity: enabled ? 1 : 0.5 }}
          >
            <div>
              <Label htmlFor={key} className="form-label mb-0.5!">
                {label}
              </Label>
              <p className="form-hint mt-0!">{hint}</p>
            </div>
            <Controller
              control={control}
              name={key}
              render={({ field }) => (
                <Switch
                  id={key}
                  checked={field.value as boolean}
                  onCheckedChange={field.onChange}
                  disabled={!enabled}
                />
              )}
            />
          </div>
        ))}
      </div>

      <div>
        <Label htmlFor="confidenceThreshold" className="form-label form-required">
          Confidence threshold
        </Label>
        <Input
          id="confidenceThreshold"
          type="number"
          min={0}
          max={1}
          step={0.05}
          className="w-32 input-base"
          disabled={!enabled}
          {...register('confidenceThreshold', { valueAsNumber: true })}
        />
        {errors.confidenceThreshold && <p className="form-error">{errors.confidenceThreshold.message}</p>}
        <p className="form-hint">Insights below this confidence (0–1) are hidden from dashboards.</p>
      </div>

      <Button type="submit" disabled={!isDirty || mutation.isPending}>
        {mutation.isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}