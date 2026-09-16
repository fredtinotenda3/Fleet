// frontend/modules/reports/pages/ExecutiveDashboard.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { useExecutiveDashboard } from '../hooks/useExecutiveDashboard';
import { useDashboardWidgets } from '../hooks/useDashboardWidgets';
import { useFuelTrendsWidget } from '@/frontend/modules/dashboard/hooks/useDashboardData';
import { useExpenseBreakdownWidget } from '@/frontend/modules/dashboard/hooks/useDashboardData';
import { useMaintenanceWidget } from '@/frontend/modules/dashboard/hooks/useDashboardData';
import { useFleetKPIs } from '@/modules/analytics/hooks/useAnalytics';
import { useFleetHealthScore } from '../hooks/useFleetHealthScore';
import { StatsCard } from '@/shared/ui/cards/StatsCard';
import { FuelTrendChart } from '../components/charts/FuelTrendChart';
import { ExpenseBreakdownChart } from '../components/charts/ExpenseBreakdownChart';
import { MaintenanceChart } from '../components/charts/MaintenanceChart';
import { FleetHealthGauge } from '../components/charts/FleetHealthGauge';
import { DashboardWidget } from '@/frontend/shared/dashboards/DashboardWidget';
import { PageHeader } from '@/frontend/shared/layouts/PageHeader';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { formatCurrency, formatNumber, formatPercent } from '@/shared/utils/currency.utils';
import { formatDistance } from '@/shared/utils/distance.utils';
import { REPORTS_ROUTES } from '../routes';
import type { ExecutiveDashboardFilter } from '../schemas/executiveDashboard';
import { DATE_PRESETS, defaultExecutiveDashboardFilter } from '../schemas/executiveDashboard';
import type { DatePreset } from '../schemas/executiveDashboard';
import { resolveFilterDateRange } from '../utils/resolveDatePreset';
import { isForbiddenError } from '@/shared/utils/api-client.utils';

// WAVE 3, R.3.1. Presets requiring an explicit 'from'/'to' pair are
// handled by the two date inputs shown only for 'custom'; every other
// preset resolves deterministically via resolveDatePreset.ts.
const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last7Days: 'Last 7 days',
  last30Days: 'Last 30 days',
  thisMonth: 'This month',
  lastMonth: 'Last month',
  thisQuarter: 'This quarter',
  lastQuarter: 'Last quarter',
  thisYear: 'This year',
  lastYear: 'Last year',
  custom: 'Custom range',
};

export default function ExecutiveDashboard() {
  const [filter, setFilter] = useState<ExecutiveDashboardFilter>(defaultExecutiveDashboardFilter);

  const {
    widgets: rawWidgets,
    kpis,
    isLoading,
    isError,
    error,
    refresh,
  } = useExecutiveDashboard(filter);
  const { widgets } = useDashboardWidgets(rawWidgets);

  // WAVE 3, R.3.1 FIX. The filter bar's own DatePreset selection now
  // actually resolves to a concrete { startDate, endDate } and is passed
  // through to useFleetKPIs -- previously `filter` was constructed but
  // never used to compute a range, and useFleetKPIs() was called with no
  // argument at all, so the Fleet Summary KPI grid always ran unfiltered
  // regardless of what (if anything) a user selected. fleetAnalyticsService
  // .getFleetKPIs already threaded an optional DateRange all the way to
  // each repository's $match stage (see expense.repository.ts,
  // fuel.repository.ts, trip.repository.ts) -- the backend half of this
  // was already correct and unused.
  const dateRange = resolveFilterDateRange(filter);

  // Independent data hooks for default analytics charts
  const fleetKPIs = useFleetKPIs(dateRange);
  const fuelTrends = useFuelTrendsWidget();
  const expenseBreakdown = useExpenseBreakdownWidget();
  const maintenanceWidget = useMaintenanceWidget();
  const fleetHealth = useFleetHealthScore();

  // Fleet health is intentionally excluded from the page-level loading/error
  // gate below: it's a slower AI computation than the other widgets, and a
  // delay or failure there shouldn't block the rest of the executive
  // dashboard from rendering. FleetHealthGauge handles its own
  // loading/error/empty states.
  //
  // WAVE 3, R.3.1 HARDENING. fuelTrends/expenseBreakdown/maintenanceWidget
  // are, as of this delivery, ALSO excluded from this page-level gate, for
  // the same reason -- and one more: their failure is very often a 403, not
  // a system error. /api/fuellogs and /api/expenses each require their own
  // permission (FUEL_VIEW/EXPENSE_VIEW) independent of the ANALYTICS_VIEW +
  // REPORT_VIEW that got a caller onto this page at all. WORKSHOP_MANAGER
  // is the concrete role that holds the latter two but neither of the
  // former -- previously that meant EVERY section of Fleet Summary failed
  // to render, including composition/activity figures (Total Vehicles,
  // Active, In Maintenance, Total Distance) that role IS authorized to see,
  // because one restricted widget's isError tripped this single page-wide
  // gate. Each of the three now renders its own Restricted/Error/Loading
  // state inline (see the isForbiddenError checks below and the isRestricted
  // prop on FuelTrendChart/ExpenseBreakdownChart/MaintenanceChart) --
  // permission failures degrade their own section, not the whole page.
  const fuelTrendsRestricted = isForbiddenError(fuelTrends.error);
  const expenseBreakdownRestricted = isForbiddenError(expenseBreakdown.error);
  const maintenanceRestricted = isForbiddenError(maintenanceWidget.error);

  if (isLoading || fleetKPIs.isLoading) {
    return <LoadingState />;
  }

  if (isError || fleetKPIs.isError) {
    return (
      <div className="flex flex-col gap-4 items-center justify-center py-12">
        <p className="text-destructive">Failed to load dashboard data.</p>
        <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : 'An error occurred.'}</p>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-md hover:bg-accent"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  // KPI cards from reporting/KPI engine (may be empty if no KPIs defined)
  const kpiCards = kpis.map((kpi: any) => ({
    name: kpi.name,
    value: formatKpiValue(kpi),
    target: kpi.targetValue,
    change: kpi.changeVsPreviousPeriod,
  }));

  // Maintenance chart data
  const maintenanceChartData = [
    { name: 'Overdue', count: fleetKPIs.data?.overdueMaintenance ?? maintenanceWidget.data?.overdueCount ?? 0 },
    { name: 'Pending', count: fleetKPIs.data?.pendingMaintenance ?? 0 },
    { name: 'Upcoming', count: maintenanceWidget.data?.upcoming?.length ?? 0 },
  ];

  const topRecommendation = fleetHealth.data?.recommendations?.[0]
    ? `${fleetHealth.data.recommendations[0].title}: ${fleetHealth.data.recommendations[0].description}`
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Executive Dashboard"
        description="Fleet-wide performance, cost, and health at a glance."
        actions={
          <button
            type="button"
            onClick={() => {
              refresh();
              fleetHealth.refetch();
            }}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border rounded-md hover:bg-accent"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        }
      />

      {/* WAVE 3, R.3.1. Date range control for the Fleet Summary KPI grid
          below -- reuses the DatePreset union executiveDashboard.ts already
          defined rather than inventing a second date-filter contract (the
          report builder's own FilterBuilder has no preset concept at all;
          this schema, already scoped to exactly Today/Yesterday/Last 7
          days/Last 30 days/current+previous month (+ quarter/year, custom),
          is the only preset-based date contract in the codebase). */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="executive-date-preset" className="block mb-1 text-xs font-medium text-muted-foreground">
            Date range
          </label>
          <select
            id="executive-date-preset"
            value={filter.datePreset}
            onChange={(e) => setFilter({ ...filter, datePreset: e.target.value as DatePreset })}
            className="px-3 py-2 text-sm border rounded-md bg-background"
          >
            {DATE_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {DATE_PRESET_LABELS[preset]}
              </option>
            ))}
          </select>
        </div>
        {filter.datePreset === 'custom' && (
          <>
            <div>
              <label htmlFor="executive-date-from" className="block mb-1 text-xs font-medium text-muted-foreground">
                From
              </label>
              <input
                id="executive-date-from"
                type="date"
                value={filter.dateFrom?.slice(0, 10) ?? ''}
                onChange={(e) =>
                  setFilter({
                    ...filter,
                    dateFrom: e.target.value ? new Date(`${e.target.value}T00:00:00.000Z`).toISOString() : undefined,
                  })
                }
                className="px-3 py-2 text-sm border rounded-md bg-background"
              />
            </div>
            <div>
              <label htmlFor="executive-date-to" className="block mb-1 text-xs font-medium text-muted-foreground">
                To
              </label>
              <input
                id="executive-date-to"
                type="date"
                value={filter.dateTo?.slice(0, 10) ?? ''}
                onChange={(e) =>
                  setFilter({
                    ...filter,
                    dateTo: e.target.value ? new Date(`${e.target.value}T23:59:59.999Z`).toISOString() : undefined,
                  })
                }
                className="px-3 py-2 text-sm border rounded-md bg-background"
              />
            </div>
          </>
        )}
      </div>

      {/* Default analytics KPIs - always shown */}
      {fleetKPIs.data && (
        <>
          {/* WAVE 3, R.3.1 FIX. Financial fields (Total Expenses/Total Fuel
              Cost/Cost per Km) are now nulled server-side by
              fleet-analytics.service.ts#getFleetKPIs whenever the caller
              lacks EXPENSE_VIEW/FUEL_VIEW/FINANCE_VIEW (see
              analytics.controller.ts) -- previously ANY role holding only
              ANALYTICS_VIEW + REPORT_VIEW (WORKSHOP_MANAGER is the concrete
              case: it has both, but neither EXPENSE_VIEW nor FUEL_VIEW)
              received raw expense/fuel totals from this endpoint with no
              server-side redaction at all. "Restricted" is shown rather
              than "N/A" -- collapsing "no permission" into "no data" would
              be its own data-truth violation, telling a Workshop Manager
              their fleet has zero operating cost rather than that the
              figure exists but is not theirs to see. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatsCard title="Total Vehicles" value={fleetKPIs.data.totalVehicles} color="blue" />
            <StatsCard title="Active" value={fleetKPIs.data.activeVehicles} color="green" />
            <StatsCard title="In Maintenance" value={fleetKPIs.data.maintenanceVehicles} color="yellow" />
            <StatsCard
              title="Total Expenses"
              value={
                fleetKPIs.data.financialAccessRestricted
                  ? 'Restricted'
                  : fleetKPIs.data.totalExpenses != null
                    ? formatCurrency(fleetKPIs.data.totalExpenses)
                    : 'N/A'
              }
              color="red"
            />
            <StatsCard
              title="Total Fuel Cost"
              value={
                fleetKPIs.data.financialAccessRestricted
                  ? 'Restricted'
                  : fleetKPIs.data.totalFuelCost != null
                    ? formatCurrency(fleetKPIs.data.totalFuelCost)
                    : 'N/A'
              }
              color="orange"
            />
            <StatsCard title="Total Distance" value={formatDistance(fleetKPIs.data.totalDistance)} color="purple" />
            <StatsCard
              title="Avg Fuel Efficiency"
              value={fleetKPIs.data.averageFuelEfficiency != null ? `${fleetKPIs.data.averageFuelEfficiency.toFixed(2)} km/L` : 'N/A'}
              color="indigo"
            />
            <StatsCard
              title="Cost per Km"
              value={
                fleetKPIs.data.financialAccessRestricted
                  ? 'Restricted'
                  : fleetKPIs.data.costPerKm != null
                    ? formatCurrency(fleetKPIs.data.costPerKm)
                    : 'N/A'
              }
              color="pink"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <FuelTrendChart
              data={fuelTrends.data?.points}
              isLoading={fuelTrends.isLoading}
              isRestricted={fuelTrendsRestricted}
              isError={fuelTrends.isError && !fuelTrendsRestricted}
              totalVolume={fuelTrends.data?.totalVolume ?? 0}
              totalCost={fuelTrends.data?.totalCost ?? 0}
            />
            <ExpenseBreakdownChart
              data={expenseBreakdown.data?.categories}
              isLoading={expenseBreakdown.isLoading}
              isRestricted={expenseBreakdownRestricted}
              isError={expenseBreakdown.isError && !expenseBreakdownRestricted}
              total={expenseBreakdown.data?.total ?? 0}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <MaintenanceChart
              data={maintenanceChartData}
              isLoading={maintenanceWidget.isLoading}
              isRestricted={maintenanceRestricted}
              isError={maintenanceWidget.isError && !maintenanceRestricted}
            />
            <FleetHealthGauge
              score={fleetHealth.data?.overallScore}
              isLoading={fleetHealth.isLoading}
              isError={fleetHealth.isError}
              topRecommendation={topRecommendation}
            />
          </div>
        </>
      )}

      {/* KPIs from the reporting engine (if defined) */}
      {kpiCards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map((kpi: any) => (
            <StatsCard
              key={kpi.name}
              title={kpi.name}
              value={kpi.value}
              description={kpi.target ? `Target: ${kpi.target}` : undefined}
              trend={kpi.change != null ? { value: Math.abs(kpi.change * 100), isPositive: kpi.change >= 0 } : undefined}
            />
          ))}
        </div>
      )}

      {/* Custom executive widgets (if configured) */}
      {widgets.length > 0 && (
        <div>
          <h2 className="text-lg font-medium mb-3">Custom Widgets</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {widgets.map((widget) => (
              <DashboardWidget
                key={widget.id}
                title={widget.title}
                isLoading={widget.isLoading}
                isError={!!widget.error}
                errorMessage={widget.error || undefined}
              >
                {widget.data ? <pre className="text-xs max-h-60 overflow-auto">{JSON.stringify(widget.data, null, 2)}</pre> : <p className="text-sm text-muted-foreground">No data</p>}
              </DashboardWidget>
            ))}
          </div>
        </div>
      )}

      {/* Quick links to AI Insights and Report Builder */}
      <div className="flex flex-wrap gap-4 text-sm">
        <Link
          href={REPORTS_ROUTES.builder.new}
          className="text-primary hover:underline"
        >
          Create a custom report
        </Link>
        <Link
          href="/reports/ai"
          className="text-primary hover:underline"
        >
          AI-Powered Insights
        </Link>
      </div>
    </div>
  );
}

function formatKpiValue(kpi: any): string {
  switch (kpi.unit) {
    case 'currency':
      return formatCurrency(kpi.value);
    case 'percent':
      return formatPercent(kpi.value);
    default:
      return formatNumber(kpi.value);
  }
}