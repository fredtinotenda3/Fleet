// frontend/modules/reports/hooks/useSavedReports.ts
//
// Backs the "Saved Reports" list shown in the builder sidebar and the
// standalone report list. Wraps reportDefinitionsApi.list/duplicate/remove
// with search, favorites, and recents from savedReportsStore.
//
// FIX (Critical — undefined report ids everywhere): this used to cast the
// raw API response straight into SavedReportSummary ({ id: string, ... })
// with `as unknown as SavedReportSummary[]`. The backend's ReportDefinition
// type (frontend/modules/reports/types/index.ts) only has `_id`, never
// `id` — so every `report.id` read anywhere downstream (ReportList's
// `key={report.id}`, `REPORTS_ROUTES.builder.edit(report.id)`,
// ExportCenter's report picker, ScheduledReports' report options) was
// `undefined`. That's the direct cause of:
//   - "Each child in a list should have a unique key prop" (every key was
//     undefined)
//   - GET /reports/builder/undefined -> GET /api/reporting/definitions/undefined 404
// Fixed by normalizing `_id` -> `id` right where the API response is
// consumed, matching the defensive `(result as any).id ?? (result as any)._id`
// pattern already used in useReportBuilder.ts / useReportPreview.ts.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reportDefinitionsApi, reportTemplatesApi } from '../services/reports.api';
import { savedReportsKeys } from './useReportBuilder';
import {
  savedReportsStore,
  useFavoriteReportIds,
  useRecentReportIds,
} from '../store/savedReportsStore';

interface SavedReportSummary {
  id: string;
  name: string;
  description?: string;
  dataSource?: string;
  updatedAt?: string;
  isShared?: boolean;
  tags?: string[];
}

interface SavedTemplateSummary {
  id: string;
  name: string;
  description?: string;
}

/** Normalizes a raw Mongo-shaped document (`_id`) onto the `id`-keyed shape the UI expects. */
function withId<T extends { _id?: string; id?: string }>(item: T): T & { id: string } {
  return { ...item, id: item.id ?? item._id ?? '' };
}

export function useSavedReports() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const favoriteIds = useFavoriteReportIds();
  const recentIds = useRecentReportIds();

  const reportsQuery = useQuery({
    queryKey: savedReportsKeys.list(),
    queryFn: () => reportDefinitionsApi.list(),
  });

  const templatesQuery = useQuery({
    queryKey: ['reports', 'templates', 'list'],
    queryFn: () => reportTemplatesApi.list(),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => reportDefinitionsApi.duplicate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: savedReportsKeys.list() }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => reportDefinitionsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: savedReportsKeys.list() }),
  });

  const instantiateTemplateMutation = useMutation({
    mutationFn: ({ templateId, name }: { templateId: string; name?: string }) =>
      reportTemplatesApi.instantiate(templateId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: savedReportsKeys.list() }),
  });

  // Normalize _id -> id here, once, so every consumer downstream
  // (ReportList, ExportCenter, ScheduledReports) can rely on report.id
  // actually being populated.
  const reports = useMemo(
    () =>
      ((reportsQuery.data ?? []) as unknown as Array<Record<string, unknown>>).map((r) =>
        withId(r as { _id?: string; id?: string }),
      ) as unknown as SavedReportSummary[],
    [reportsQuery.data],
  );

  const templates = useMemo(
    () =>
      ((templatesQuery.data ?? []) as unknown as Array<Record<string, unknown>>).map((t) =>
        withId(t as { _id?: string; id?: string }),
      ) as unknown as SavedTemplateSummary[],
    [templatesQuery.data],
  );

  const filteredReports = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return reports;
    return reports.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        r.description?.toLowerCase().includes(term) ||
        r.tags?.some((t) => t.toLowerCase().includes(term)),
    );
  }, [reports, search]);

  const favoriteReports = useMemo(
    () => reports.filter((r) => favoriteIds.includes(r.id)),
    [reports, favoriteIds],
  );

  const recentReports = useMemo(
    () =>
      recentIds
        .map((id) => reports.find((r) => r.id === id))
        .filter((r): r is SavedReportSummary => !!r),
    [reports, recentIds],
  );

  return {
    reports: filteredReports,
    favoriteReports,
    recentReports,
    templates,
    isLoading: reportsQuery.isLoading,
    isError: reportsQuery.isError,
    error: reportsQuery.error,
    search,
    setSearch,
    toggleFavorite: (id: string) => savedReportsStore.toggleFavorite(id),
    isFavorite: (id: string) => favoriteIds.includes(id),
    markRecentlyViewed: (id: string) => savedReportsStore.markRecentlyViewed(id),
    duplicate: duplicateMutation.mutateAsync,
    isDuplicating: duplicateMutation.isPending,
    remove: removeMutation.mutateAsync,
    isRemoving: removeMutation.isPending,
    instantiateTemplate: instantiateTemplateMutation.mutateAsync,
    isInstantiatingTemplate: instantiateTemplateMutation.isPending,
  };
}