// frontend/shared/dashboards/widgets/FleetStatusWidget.tsx

'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Truck } from 'lucide-react';
import { DashboardWidget } from '@/frontend/shared/dashboards/DashboardWidget';
import { useVehicleStatsWidget } from '@/frontend/modules/dashboard/hooks/useDashboardData';

const STATUS_COLORS: Record<string, string> = {
  Active: 'var(--fleet-available)',
  Maintenance: 'var(--fleet-maintenance)',
  Inactive: 'var(--fleet-offline)',
};

export function FleetStatusWidget() {
  const { data, isLoading, isError, refetch } = useVehicleStatsWidget();

  const chartData = data
    ? [
        { name: 'Active', value: data.active },
        { name: 'Maintenance', value: data.maintenance },
        { name: 'Inactive', value: data.inactive },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <DashboardWidget
      title="Fleet status"
      icon={<Truck className="w-4 h-4" />}
      isLoading={isLoading}
      isError={isError}
      onRefresh={() => refetch()}
    >
      {chartData.length === 0 ? (
        <p className="py-8 text-center text-body-sm text-muted-foreground">No vehicles recorded yet.</p>
      ) : (
        <div className="flex items-center gap-4">
          <div style={{ width: 120, height: 120 }} className="shrink-0">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={32} outerRadius={56} paddingAngle={2}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? 'var(--chart-4)'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex-1 space-y-2">
            {chartData.map((entry) => (
              <li key={entry.name} className="flex items-center justify-between text-body-sm">
                <span className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: STATUS_COLORS[entry.name] ?? 'var(--chart-4)' }}
                    aria-hidden="true"
                  />
                  {entry.name}
                </span>
                <span className="font-medium tabular-nums text-foreground">{entry.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashboardWidget>
  );
}
