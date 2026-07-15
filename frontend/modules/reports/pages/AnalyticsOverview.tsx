/* eslint-disable @typescript-eslint/no-unused-vars */
// frontend/modules/reports/pages/AnalyticsOverview.tsx
'use client';

import { useState } from 'react';
import { useFleetKPIs, useOperationalMetrics, useCostBreakdown, useFuelEfficiencyTrend, useMaintenanceForecast } from '@/frontend/modules/analytics/hooks/useAnalytics';
import { StatsCard } from '@/shared/ui/cards/StatsCard';
import { ChartContainer } from '@/frontend/shared/ui/charts';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { formatCurrency, formatNumber, formatPercent } from '@/shared/utils/currency.utils';
import { formatDistance, formatEfficiency } from '@/shared/utils/distance.utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend } from 'recharts';
import { getChartColor } from '@/shared/utils/chart.utils';
import { DateRange } from '@/shared/types/common.types';

export default function AnalyticsOverview() {
  const [dateRange] = useState<DateRange>({
    startDate: new Date(new Date().setDate(new Date().getDate() - 30)),
    endDate: new Date(),
  });

  const fleetKPIs = useFleetKPIs(dateRange);
  const operationalMetrics = useOperationalMetrics(dateRange);
  const costBreakdown = useCostBreakdown(dateRange);
  const fuelEfficiencyTrend = useFuelEfficiencyTrend(6);
  const maintenanceForecast = useMaintenanceForecast();

  if (fleetKPIs.isLoading || operationalMetrics.isLoading) return <LoadingState />;

  const kpis = fleetKPIs.data;
  const metrics = operationalMetrics.data;
  const cost = costBreakdown.data;
  const fuelTrend = fuelEfficiencyTrend.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fleet Overview</h1>
        <p className="text-sm text-muted-foreground">Key performance indicators and operational metrics.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard title="Total Vehicles" value={kpis?.totalVehicles ?? 0} color="blue" />
        <StatsCard title="Active" value={kpis?.activeVehicles ?? 0} color="green" />
        <StatsCard title="Total Expenses" value={formatCurrency(kpis?.totalExpenses ?? 0)} color="red" />
        <StatsCard title="Total Fuel Cost" value={formatCurrency(kpis?.totalFuelCost ?? 0)} color="yellow" />
        <StatsCard title="Total Distance" value={formatDistance(kpis?.totalDistance ?? 0)} color="purple" />
        <StatsCard title="Fuel Efficiency" value={kpis?.averageFuelEfficiency != null ? formatEfficiency(kpis.averageFuelEfficiency) : 'N/A'} color="indigo" />
        <StatsCard title="Cost per Km" value={kpis?.costPerKm != null ? formatCurrency(kpis.costPerKm) : 'N/A'} color="orange" />
        <StatsCard title="Pending Maintenance" value={kpis?.pendingMaintenance ?? 0} color="yellow" />
      </div>

      {/* Operational Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatsCard title="Avg Daily Distance" value={formatDistance(metrics.averageDailyDistance, 'km', 0)} color="blue" />
          <StatsCard title="Avg Daily Expense" value={formatCurrency(metrics.averageDailyExpense)} color="red" />
          <StatsCard title="Avg Cost per Vehicle" value={formatCurrency(metrics.averageCostPerVehicle)} color="purple" />
          <StatsCard title="Utilization Rate" value={formatPercent(metrics.vehicleUtilizationRate)} color="green" />
        </div>
      )}

      {/* Cost Breakdown Chart */}
      {cost && (
        <ChartContainer title="Cost by Category">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={Object.entries(cost.byCategory).map(([name, value]) => ({ name, value }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Bar dataKey="value" fill="var(--primary)">
                {Object.keys(cost.byCategory).map((_, idx) => (
                  <Cell key={idx} fill={getChartColor(idx)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}

      {/* Fuel Efficiency Trend */}
      {fuelTrend.length > 0 && (
        <ChartContainer title="Fuel Efficiency Trend (km/L)">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={fuelTrend.map((f: any) => ({ month: f.month, efficiency: f.efficiency }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value: number) => value.toFixed(2)} />
              <Legend />
              <Line type="monotone" dataKey="efficiency" stroke="var(--primary)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}

      {/* Maintenance Forecast */}
      {maintenanceForecast.data && maintenanceForecast.data.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Maintenance Forecast (next 30 days)</h3>
          <div className="border rounded-md divide-y">
            {maintenanceForecast.data.slice(0, 5).map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{item.license_plate}</p>
                  <p className="text-xs text-muted-foreground">Due in {item.daysUntilDue} days</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatCurrency(item.estimatedCost)}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${item.priority === 'high' ? 'bg-red-100 text-red-700' : item.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                    {item.priority}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}