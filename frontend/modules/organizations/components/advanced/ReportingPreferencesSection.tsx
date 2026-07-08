// frontend/modules/organizations/components/advanced/ReportingPreferencesSection.tsx
'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Label } from '@/frontend/shared/ui/forms/label';
import { Switch } from '@/frontend/shared/ui/forms/switch';
import { Button } from '@/frontend/shared/ui/primitives/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/frontend/shared/ui/forms/select';
import { reportingPreferencesSchema, ReportingPreferencesFormValues } from '../../schemas/advanced.schema';
import { useUpdateReportingPreferences } from '../../hooks/useAdvancedSettings';
import type { Organization } from '../../types';
import type { OrganizationReportingPreferences } from '../../types/advanced.types';
import { DEFAULT_REPORTING_PREFERENCES } from './defaults';

type OrganizationWithReporting = Organization & { reportingPreferences?: OrganizationReportingPreferences };

interface Props {
  organization: Organization;
}

export function ReportingPreferencesSection({ organization }: Props) {
  const mutation = useUpdateReportingPreferences(organization._id!);
  const existing = (organization as OrganizationWithReporting).reportingPreferences ?? DEFAULT_REPORTING_PREFERENCES;

  const { handleSubmit, control, formState: { isDirty } } = useForm<ReportingPreferencesFormValues>({
    resolver: zodResolver(reportingPreferencesSchema),
    defaultValues: existing,
  });

  const onSubmit = (data: ReportingPreferencesFormValues) =>
    mutation.mutate({
      defaultExportFormat: data.defaultExportFormat,
      autoWeeklyDigest: data.autoWeeklyDigest,
      defaultDashboardId: data.defaultDashboardId || undefined,
    });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-form-narrow">
      <div>
        <Label htmlFor="defaultExportFormat" className="form-label form-required">
          Default export format
        </Label>
        <Controller
          control={control}
          name="defaultExportFormat"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="defaultExportFormat" className="input-base">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="excel">Excel</SelectItem>
                <SelectItem value="word">Word</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex items-center justify-between p-3 border rounded-md border-border">
        <div>
          <Label htmlFor="autoWeeklyDigest" className="form-label mb-0.5!">
            Weekly digest email
          </Label>
          <p className="form-hint mt-0!">Send a summary report to owners every Monday.</p>
        </div>
        <Controller
          control={control}
          name="autoWeeklyDigest"
          render={({ field }) => (
            <Switch id="autoWeeklyDigest" checked={field.value} onCheckedChange={field.onChange} />
          )}
        />
      </div>

      <Button type="submit" disabled={!isDirty || mutation.isPending}>
        {mutation.isPending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}