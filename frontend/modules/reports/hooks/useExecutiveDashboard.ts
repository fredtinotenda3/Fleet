// frontend/modules/reports/hooks/useExecutiveDashboard.ts
//
// Loads the executive dashboard definition + its rendered widget data via
// the already-implemented dashboardsApi (dashboardsApi.list/get/render in
// frontend/modules/reports/services/reports.api.ts), and evaluates the org's
// top-level KPI set via kpisApi.evaluateAll. Both calls are tenant-scoped
// server-side (dashboard.service.ts / kpi.engine.ts enforce this), so no
// tenant id is passed from the client.

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardsApi, kpisApi } from '../services/reports.api';
import type { ExecutiveDashboardFilter } from '../schemas/executiveDashboard';
import { mapDashboardDataToWidgets } from '../utils/widgetMappers';

export const executiveDashboardKeys = {
  all: ['reports', 'executive-dashboard'] as const,
  list: () => [...executiveDashboardKeys.all, 'list'] as const,
  render: (dashboardId: string) => [...executiveDashboardKeys.all, 'render', dashboardId] as const,
  kpis: () => [...executiveDashboardKeys.all, 'kpis'] as const,
};

const STALE_TIME_MS = 60_000;
const KPI_REFRESH_INTERVAL_MS = 5 * 60_000;

/**
 * Resolves which dashboard record is "the" executive dashboard. The reporting
 * module supports many dashboards per tenant (custom ones built via
 * DashboardBuilder); the executive one is the first dashboard flagged
 * `executive: true` returned by dashboardsApi.list(true).
 */
function useExecutiveDashboardId() {
  const query = useQuery({
    queryKey: executiveDashboardKeys.list(),
    queryFn: () => dashboardsApi.list(true),
    staleTime: STALE_TIME_MS,
  });

  const dashboard = query.data?.[0] as { id?: string; _id?: string } | undefined;
  const dashboardId = dashboard?.id ?? dashboard?._id ?? null;

  return { ...query, dashboardId };
}

export function useExecutiveDashboard(filter?: ExecutiveDashboardFilter) {
  const queryClient = useQueryClient();
  const { dashboardId, isLoading: isResolvingDashboard, error: dashboardListError } =
    useExecutiveDashboardId();

  const dashboardQuery = useQuery({
    queryKey: dashboardId ? executiveDashboardKeys.render(dashboardId) : executiveDashboardKeys.render('pending'),
    queryFn: () => dashboardsApi.render(dashboardId as string),
    enabled: !!dashboardId,
    staleTime: STALE_TIME_MS,
    refetchOnWindowFocus: false,
  });

  const kpiQuery = useQuery({
    queryKey: executiveDashboardKeys.kpis(),
    queryFn: () => kpisApi.evaluateAll(),
    staleTime: STALE_TIME_MS,
    refetchInterval: KPI_REFRESH_INTERVAL_MS,
  });

  const widgets = useMemo(
    () => mapDashboardDataToWidgets(dashboardQuery.data),
    [dashboardQuery.data],
  );

  const refresh = () => {
    if (dashboardId) {
      queryClient.invalidateQueries({ queryKey: executiveDashboardKeys.render(dashboardId) });
    }
    queryClient.invalidateQueries({ queryKey: executiveDashboardKeys.kpis() });
  };

  return {
    dashboardId,
    widgets,
    kpis: kpiQuery.data ?? [],
    isLoading: isResolvingDashboard || dashboardQuery.isLoading || kpiQuery.isLoading,
    isFetching: dashboardQuery.isFetching || kpiQuery.isFetching,
    isError: !!dashboardListError || dashboardQuery.isError || kpiQuery.isError,
    error: dashboardListError ?? dashboardQuery.error ?? kpiQuery.error ?? null,
    hasNoDashboard: !isResolvingDashboard && !dashboardId,
    refresh,
    // filter is accepted for API-shape stability with the widget filter bar;
    // executive dashboard widgets are currently org/date scoped server-side
    // via dashboard.service.ts, so client-side filtering narrows the KPI/
    // widget list rather than re-issuing scoped requests.
    filter,
  };
}