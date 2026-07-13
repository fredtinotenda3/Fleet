// frontend/modules/reports/hooks/useReportBuilder.ts
//
// Orchestrates the builder store, validation, and create/update mutations
// against reportDefinitionsApi. Loads an existing definition when editing
// (reportId present) and hydrates the builder store from it.

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reportDefinitionsApi } from '../services/reports.api';
import {
  reportDefinitionFormSchema,
  type ReportDefinitionForm,
} from '../schemas/reportDefinition';
import {
  buildReportDefinitionPayload,
  buildReportDefinitionUpdatePayload,
  mapDefinitionToForm,
} from '../utils/queryBuilder';
import { reportBuilderStore, useReportBuilderStore } from '../store/reportBuilderStore';

export const savedReportsKeys = {
  all: ['reports', 'definitions'] as const,
  list: () => [...savedReportsKeys.all, 'list'] as const,
  detail: (id: string) => [...savedReportsKeys.all, 'detail', id] as const,
};

export function useReportBuilder(reportId?: string) {
  const queryClient = useQueryClient();
  const form = useReportBuilderStore();
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const existingReportQuery = useQuery({
    queryKey: reportId ? savedReportsKeys.detail(reportId) : ['reports', 'definitions', 'detail', 'none'],
    queryFn: () => reportDefinitionsApi.get(reportId as string),
    enabled: !!reportId,
  });

  useEffect(() => {
    if (existingReportQuery.data) {
      const hydrated = mapDefinitionToForm(existingReportQuery.data as unknown as Record<string, unknown>);
      reportBuilderStore.loadDefinition({ ...form, ...hydrated } as ReportDefinitionForm);
    } else if (!reportId) {
      reportBuilderStore.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingReportQuery.data, reportId]);

  const createMutation = useMutation({
    mutationFn: (payload: ReportDefinitionForm) => reportDefinitionsApi.create(buildReportDefinitionPayload(payload)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savedReportsKeys.list() });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: ReportDefinitionForm) =>
      reportDefinitionsApi.update(reportId as string, buildReportDefinitionUpdatePayload(payload)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savedReportsKeys.list() });
      if (reportId) queryClient.invalidateQueries({ queryKey: savedReportsKeys.detail(reportId) });
    },
  });

  function validate(): boolean {
    const result = reportDefinitionFormSchema.safeParse(form);
    if (result.success) {
      setValidationErrors({});
      return true;
    }
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      errors[issue.path.join('.')] = issue.message;
    }
    setValidationErrors(errors);
    return false;
  }

  async function save(): Promise<{ id: string } | null> {
    if (!validate()) return null;
    const result = reportId ? await updateMutation.mutateAsync(form) : await createMutation.mutateAsync(form);
    return { id: (result as { id?: string; _id?: string }).id ?? (result as { _id?: string })._id ?? '' };
  }

  return {
    form,
    isEditing: !!reportId,
    isLoadingExisting: existingReportQuery.isLoading,
    validationErrors,
    validate,
    save,
    isSaving: createMutation.isPending || updateMutation.isPending,
    saveError: createMutation.error ?? updateMutation.error ?? null,
    store: reportBuilderStore,
  };
}