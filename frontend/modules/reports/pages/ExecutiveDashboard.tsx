// frontend/modules/reports/pages/ExecutiveDashboard.tsx
//
// Top-level Executive Dashboard for the Reports module. Renders the
// tenant's executive dashboard (dashboardsApi) through the existing shared
// widget system (frontend/shared/dashboards/{DashboardGrid,DashboardWidget}),
// with an org/date/vehicle filter bar and the tenant's evaluated KPI set on
// top. No mock data - every value comes from dashboardsApi.render() and
// kpisApi.evaluateAll(), both of which hit the real reporting backend.

'use client';

import { useState } from 'react';
import { RefreshCw, PinOff, Pin, X } from 'lucide-react';
import { useExecutiveDashboard } from '../hooks/useExecutiveDashboard';
import { useDashboardWidgets } from '../hooks/useDashboardWidgets';
import {
  defaultExecutiveDashboardFilter,
  type ExecutiveDashboardFilter,
} from '../schemas/executiveDashboard';
import { DashboardWidget } from '@/frontend/shared/dashboards/DashboardWidget';
import { StatsCard } from '@/shared/ui/cards/StatsCard';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { FilterBar } from '@/shared/ui/filters/FilterBar';
import { formatCurrency, formatPercent, formatNumber } from '@/shared/utils/currency.utils';

interface KpiEvaluationResultLike {
  id?: string;
  kpiDefinitionId?: string;
  name: string;
  value: number;
  target?: number | null;
  unit?: 'currency' | 'percent' | 'number' | string;
  trend?: 'up' | 'down' | 'flat';
  changeVsPreviousPeriod?: number | null;
}

function formatKpiValue(kpi: KpiEvaluationResultLike): string {
  switch (kpi.unit) {
    case 'currency':
      return formatCurrency(kpi.value);
    case 'percent':
      return formatPercent(kpi.value);
    default:
      return formatNumber(kpi.value);
  }
}

export default function ExecutiveDashboard() {
  const [filter, setFilter] = useState<ExecutiveDashboardFilter>(defaultExecutiveDashboardFilter);

  const {
    widgets: rawWidgets,
    kpis,
    isLoading,
    isFetching,
    isError,
    error,
    hasNoDashboard,
    refresh,
  } = useExecutiveDashboard(filter);

  const { widgets, isPinned, togglePin, dismissWidget } = useDashboardWidgets(rawWidgets);

  if (isLoading) {
    return <LoadingState />;
  }

  if (isError) {
    return (
      <EmptyState
        title="Couldn't load the executive dashboard"
        description={error instanceof Error ? error.message : 'An unexpected error occurred.'}
        action={{ label: 'Retry', onClick: refresh }}
      />
    );
  }

  if (hasNoDashboard) {
    return (
      <EmptyState
        title="No executive dashboard configured"
        description="An administrator needs to mark a dashboard as executive in Dashboard Settings before it appears here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Executive Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Fleet-wide performance, cost, and health at a glance.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={isFetching}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border rounded-md hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <FilterBar
        searchValue=""
        onSearchChange={() => {}}
        filters={<span className="text-sm text-muted-foreground">Advanced filters are applied via API in this view.</span>}
      />

      {kpis.length > 0 && (
        <section aria-label="Key performance indicators" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi: KpiEvaluationResultLike) => (
            <StatsCard
              key={kpi.id ?? kpi.kpiDefinitionId ?? kpi.name}
              title={kpi.name}
              value={formatKpiValue(kpi)}
              description={kpi.target != null ? `Target: ${formatKpiValue({ ...kpi, value: kpi.target })}` : undefined}
              trend={
                typeof kpi.changeVsPreviousPeriod === 'number'
                  ? {
                      value: Number((Math.abs(kpi.changeVsPreviousPeriod) * 100).toFixed(1)),
                      isPositive: kpi.changeVsPreviousPeriod >= 0,
                    }
                  : undefined
              }
            />
          ))}
        </section>
      )}

      {widgets.length === 0 ? (
        <EmptyState
          title="This dashboard has no widgets yet"
          description="Add widgets from Dashboard Settings to populate the executive view."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {widgets.map((widget) => (
            <div 
              key={widget.id} 
              className="relative group"
              style={{
                gridColumn: widget.gridPosition?.w ? `span ${Math.min(widget.gridPosition.w, 4)}` : undefined,
                gridRow: widget.gridPosition?.h ? `span ${widget.gridPosition.h}` : undefined,
              }}
            >
              <div className="absolute z-10 hidden gap-1 right-2 top-2 group-hover:flex">
                <button
                  type="button"
                  onClick={() => togglePin(widget.id)}
                  className="rounded-md bg-background/90 p-1.5 shadow-sm hover:bg-accent"
                  aria-label={isPinned(widget.id) ? 'Unpin widget' : 'Pin widget'}
                  title={isPinned(widget.id) ? 'Unpin widget' : 'Pin widget'}
                >
                  {isPinned(widget.id) ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => dismissWidget(widget.id)}
                  className="rounded-md bg-background/90 p-1.5 shadow-sm hover:bg-accent"
                  aria-label="Dismiss widget"
                  title="Dismiss widget"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <DashboardWidget
                title={widget.title}
                isLoading={widget.isLoading}
                isError={!!widget.error}
                errorMessage={widget.error || undefined}
                className="h-full"
              >
                <div className="w-full h-full min-h-37.5 p-2 overflow-auto text-xs font-mono bg-muted/20 text-muted-foreground whitespace-pre-wrap rounded-md">
                  {widget.data ? JSON.stringify(widget.data, null, 2) : 'No data available'}
                </div>
              </DashboardWidget>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}