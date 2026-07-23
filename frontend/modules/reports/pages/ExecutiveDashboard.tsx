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
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { formatCurrency, formatNumber, formatPercent } from '@/shared/utils/currency.utils';
import { formatDistance } from '@/shared/utils/distance.utils';
import { REPORTS_ROUTES } from '../routes';
import type { ExecutiveDashboardFilter } from '../schemas/executiveDashboard';
import { defaultExecutiveDashboardFilter } from '../schemas/executiveDashboard';

export default function ExecutiveDashboard() {
  const [filter] = useState<ExecutiveDashboardFilter>(defaultExecutiveDashboardFilter);

  const {
    widgets: rawWidgets,
    kpis,
    isLoading,
    isError,
    error,
    refresh,
  } = useExecutiveDashboard(filter);
  const { widgets } = useDashboardWidgets(rawWidgets);

  // Independent data hooks for default analytics charts
  const fleetKPIs = useFleetKPIs();
  const fuelTrends = useFuelTrendsWidget();
  const expenseBreakdown = useExpenseBreakdownWidget();
  const maintenanceWidget = useMaintenanceWidget();
  const fleetHealth = useFleetHealthScore();

  // Fleet health is intentionally excluded from the page-level loading/error
  // gate below: it's a slower AI computation than the other widgets, and a
  // delay or failure there shouldn't block the rest of the executive
  // dashboard from rendering. FleetHealthGauge handles its own
  // loading/error/empty states.

  if (isLoading || fleetKPIs.isLoading || fuelTrends.isLoading || expenseBreakdown.isLoading || maintenanceWidget.isLoading) {
    return <LoadingState />;
  }

  if (isError || fleetKPIs.isError || fuelTrends.isError || expenseBreakdown.isError || maintenanceWidget.isError) {
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Executive Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Fleet-wide performance, cost, and health at a glance.
          </p>
        </div>
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
      </div>

      {/* Default analytics KPIs - always shown */}
      {fleetKPIs.data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatsCard title="Total Vehicles" value={fleetKPIs.data.totalVehicles} color="blue" />
            <StatsCard title="Active" value={fleetKPIs.data.activeVehicles} color="green" />
            <StatsCard title="In Maintenance" value={fleetKPIs.data.maintenanceVehicles} color="yellow" />
            <StatsCard title="Total Expenses" value={formatCurrency(fleetKPIs.data.totalExpenses)} color="red" />
            <StatsCard title="Total Fuel Cost" value={formatCurrency(fleetKPIs.data.totalFuelCost)} color="orange" />
            <StatsCard title="Total Distance" value={formatDistance(fleetKPIs.data.totalDistance)} color="purple" />
            <StatsCard
              title="Avg Fuel Efficiency"
              value={fleetKPIs.data.averageFuelEfficiency != null ? `${fleetKPIs.data.averageFuelEfficiency.toFixed(2)} km/L` : 'N/A'}
              color="indigo"
            />
            <StatsCard
              title="Cost per Km"
              value={fleetKPIs.data.costPerKm != null ? formatCurrency(fleetKPIs.data.costPerKm) : 'N/A'}
              color="pink"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <FuelTrendChart
              data={fuelTrends.data?.points}
              isLoading={false}
              totalVolume={fuelTrends.data?.totalVolume ?? 0}
              totalCost={fuelTrends.data?.totalCost ?? 0}
            />
            <ExpenseBreakdownChart
              data={expenseBreakdown.data?.categories}
              isLoading={false}
              total={expenseBreakdown.data?.total ?? 0}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <MaintenanceChart
              data={maintenanceChartData}
              isLoading={false}
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