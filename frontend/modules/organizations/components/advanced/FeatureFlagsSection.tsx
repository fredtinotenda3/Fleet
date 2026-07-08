// frontend/modules/organizations/components/advanced/FeatureFlagsSection.tsx
'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Switch } from '@/frontend/shared/ui/forms/switch';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Badge } from '@/frontend/shared/ui/data-display/badge';
import { featureFlagsSchema, FeatureFlagsFormValues } from '../../schemas/advanced.schema';
import { useUpdateFeatureFlags } from '../../hooks/useAdvancedSettings';
import type { Organization } from '../../types';

interface Props {
  organization: Organization;
}

const FLAG_DEFINITIONS: { key: keyof FeatureFlagsFormValues; label: string; hint: string }[] = [
  { key: 'customBranding', label: 'Custom branding', hint: 'Logo, colors, and favicon on all customer-facing surfaces.' },
  { key: 'advancedAnalytics', label: 'Advanced analytics', hint: 'Cross-fleet trend analysis and cohort comparisons.' },
  { key: 'telematics', label: 'Telematics', hint: 'Live GPS tracking, geofencing, and driver behavior scoring.' },
  { key: 'apiAccess', label: 'API access', hint: 'Issue API keys and OAuth clients for external integrations.' },
  { key: 'auditLogs', label: 'Audit logs', hint: 'Immutable, hash-chained record of every privileged action.' },
  { key: 'prioritySupport', label: 'Priority support', hint: 'Faster SLA on support tickets.' },
];

export function FeatureFlagsSection({ organization }: Props) {
  const mutation = useUpdateFeatureFlags(organization._id!);

  const { control, handleSubmit, formState: { isDirty } } = useForm<FeatureFlagsFormValues>({
    resolver: zodResolver(featureFlagsSchema),
    defaultValues: {
      customBranding: organization.features.customBranding,
      advancedAnalytics: organization.features.advancedAnalytics,
      telematics: organization.features.telematics,
      apiAccess: organization.features.apiAccess,
      auditLogs: organization.features.auditLogs,
      prioritySupport: organization.features.prioritySupport,
    },
  });

  const onSubmit = (data: FeatureFlagsFormValues) => mutation.mutate(data);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 max-w-form-wide">
      <p className="text-body-sm text-muted-foreground">
        Toggle platform capabilities for this organization. Some flags may be limited by your
        subscription tier ({organization.subscription.tier}).
      </p>

      {FLAG_DEFINITIONS.map(({ key, label, hint }) => (
        <div key={key} className="flex items-center justify-between p-3 border rounded-md border-border">
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
              <Switch id={key} checked={field.value} onCheckedChange={field.onChange} />
            )}
          />
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!isDirty || mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save changes'}
        </Button>
        <Badge variant="outline" className="capitalize">
          {organization.subscription.tier} plan
        </Badge>
      </div>
    </form>
  );
}