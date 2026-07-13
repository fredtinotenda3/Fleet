// frontend/modules/reports/hooks/useScheduledReports.ts
//
// A "scheduled report" is a saved ReportDefinition with its `schedule` field
// populated - report-definition.controller.ts already wires this to the
// platform cron catalogue via reportSchedulerService.syncSchedule() on
// every create/update, and removeSchedule() on delete
// (modules/reporting/services/report-scheduler.service.ts). This hook does
// not call a separate scheduling endpoint; it reads/writes the schedule
// field on the definitions the user already owns, which is the exact
// mechanism the backend controller implements.

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reportDefinitionsApi } from '../services/reports.api';
import { savedReportsKeys } from './useReportBuilder';
import { buildCronExpression, describeSchedule } from '../utils/scheduleParser';
import type { ScheduleConfigForm } from '../schemas/scheduleConfig';

interface ReportDefinitionLike {
  id: string;
  name: string;
  schedule?: { cron?: string; timezone?: string; recipients?: string[]; enabled?: boolean };
}

export function useScheduledReports() {
  const queryClient = useQueryClient();

  const definitionsQuery = useQuery({
    queryKey: savedReportsKeys.list(),
    queryFn: () => reportDefinitionsApi.list(),
  });

  const scheduledReports = useMemo(() => {
    const all = (definitionsQuery.data ?? []) as unknown as ReportDefinitionLike[];
    return all.filter((r) => !!r.schedule?.cron);
  }, [definitionsQuery.data]);

  const saveScheduleMutation = useMutation({
    mutationFn: ({ reportId, form }: { reportId: string; form: ScheduleConfigForm }) =>
      reportDefinitionsApi.update(reportId, {
        schedule: {
          cron: buildCronExpression(form),
          timezone: form.timezone,
          recipients: form.recipients,
          enabled: form.isActive,
          format: form.format,
          deliveryMethod: form.deliveryMethod,
        },
      } as never),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: savedReportsKeys.list() }),
  });

  const pauseMutation = useMutation({
    mutationFn: (reportId: string) =>
      reportDefinitionsApi.update(reportId, { schedule: { enabled: false } } as never),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: savedReportsKeys.list() }),
  });

  const resumeMutation = useMutation({
    mutationFn: (reportId: string) =>
      reportDefinitionsApi.update(reportId, { schedule: { enabled: true } } as never),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: savedReportsKeys.list() }),
  });

  const removeScheduleMutation = useMutation({
    mutationFn: (reportId: string) =>
      reportDefinitionsApi.update(reportId, { schedule: null } as never),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: savedReportsKeys.list() }),
  });

  return {
    scheduledReports,
    describeSchedule: (report: ReportDefinitionLike) =>
      report.schedule
        ? describeSchedule({
            reportDefinitionId: report.id,
            frequency: 'custom',
            cron: report.schedule.cron,
            timeOfDay: '00:00',
            timezone: report.schedule.timezone ?? 'UTC',
            format: 'excel',
            deliveryMethod: 'email',
            recipients: report.schedule.recipients ?? [],
            isActive: report.schedule.enabled ?? true,
          })
        : 'Not scheduled',
    isLoading: definitionsQuery.isLoading,
    isError: definitionsQuery.isError,
    saveSchedule: saveScheduleMutation.mutateAsync,
    isSaving: saveScheduleMutation.isPending,
    pause: pauseMutation.mutateAsync,
    resume: resumeMutation.mutateAsync,
    removeSchedule: removeScheduleMutation.mutateAsync,
  };
}