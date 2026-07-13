// frontend/modules/reports/hooks/useSavedReports.ts
//
// Backs the "Saved Reports" list shown in the builder sidebar and the
// standalone report list. Wraps reportDefinitionsApi.list/duplicate/remove
// with search, favorites, and recents from savedReportsStore.

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

  // Wrapped in useMemo to prevent generating a new array reference on every render
  // when reportsQuery.data is undefined, which satisfies exhaustive-deps downstream.
  const reports = useMemo(
    () => (reportsQuery.data ?? []) as unknown as SavedReportSummary[],
    [reportsQuery.data]
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
    templates: templatesQuery.data ?? [],
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