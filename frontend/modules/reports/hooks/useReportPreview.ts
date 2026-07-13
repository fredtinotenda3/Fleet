// frontend/modules/reports/hooks/useReportPreview.ts
//
// Live preview of the builder draft. The backend only supports previewing a
// *saved* definition (reportDefinitionsApi.preview(id) /
// previewPivot(id) -> report-definition.controller.ts#preview,
// #previewPivot), so the preview flow is: debounce edits -> autosave a draft
// (create if new, update if editing) -> fetch preview for that id. This
// mirrors report-builder.service.ts's actual contract instead of inventing
// a client-only preview endpoint that doesn't exist on the backend.

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reportDefinitionsApi } from '../services/reports.api';
import type { ReportDefinitionForm } from '../schemas/reportDefinition';
import { buildReportDefinitionPayload, buildReportDefinitionUpdatePayload } from '../utils/queryBuilder';
import type { ReportResult, PivotResult } from '../types';

const AUTOSAVE_DEBOUNCE_MS = 800;

export function useReportPreview(form: ReportDefinitionForm, draftReportId: string | null) {
  const queryClient = useQueryClient();
  const [previewReportId, setPreviewReportId] = useState<string | null>(draftReportId);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const upsertDraftMutation = useMutation({
    mutationFn: async () => {
      if (previewReportId) {
        return reportDefinitionsApi.update(previewReportId, buildReportDefinitionUpdatePayload(form));
      }
      return reportDefinitionsApi.create(buildReportDefinitionPayload(form));
    },
    onSuccess: (result) => {
      const id = (result as { id?: string; _id?: string }).id ?? (result as { _id?: string })._id;
      if (id) setPreviewReportId(id);
    },
  });

  useEffect(() => {
    const hasMinimumShape = form.name.trim().length > 0 && form.columns.length > 0;
    if (!hasMinimumShape) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      upsertDraftMutation.mutate();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(form)]);

  const previewQuery = useQuery({
    queryKey: ['reports', 'definitions', previewReportId, 'preview', form.isPivot],
    // Explicitly cast to a single Promise resolving to a union to satisfy useQuery typings
    queryFn: () =>
      (form.isPivot
        ? reportDefinitionsApi.previewPivot(previewReportId as string)
        : reportDefinitionsApi.preview(previewReportId as string)) as Promise<ReportResult | PivotResult>,
    enabled: !!previewReportId,
  });

  const drilldownMutation = useMutation({
    mutationFn: (groupValues: Record<string, unknown>) =>
      reportDefinitionsApi.drilldown(previewReportId as string, groupValues),
  });

  function refreshPreview() {
    if (previewReportId) {
      queryClient.invalidateQueries({
        queryKey: ['reports', 'definitions', previewReportId, 'preview', form.isPivot],
      });
    }
  }

  return {
    previewReportId,
    result: previewQuery.data ?? null,
    isLoading: previewQuery.isLoading || upsertDraftMutation.isPending,
    isFetching: previewQuery.isFetching,
    isError: previewQuery.isError,
    error: previewQuery.error,
    refreshPreview,
    drilldown: drilldownMutation.mutateAsync,
    isDrillingDown: drilldownMutation.isPending,
    drilldownResult: drilldownMutation.data ?? null,
  };
}