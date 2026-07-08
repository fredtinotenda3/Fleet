
// frontend/shared/dashboards/widgets/FuelWidget.tsx

'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Fuel as FuelIcon } from 'lucide-react';
import { DashboardWidget } from '@/frontend/shared/dashboards/DashboardWidget';
import { useFuelTrendsWidget } from '@/frontend/modules/dashboard/hooks/useDashboardData';
import { formatCurrency } from '@/shared/utils/currency.utils';

export function FuelWidget() {
  const { data, isLoading, isError, refetch } = useFuelTrendsWidget();
  const points = data?.points ?? [];

  return (
    <DashboardWidget
      title="Fuel trends"
      icon={<FuelIcon className="w-4 h-4" />}
      isLoading={isLoading}
      isError={isError}
      onRefresh={() => refetch()}
    >
      {points.length === 0 ? (
        <p className="py-8 text-center text-body-sm text-muted-foreground">No fuel logs recorded yet.</p>
      ) : (
        <>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={points} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                  formatter={(value: number, name: string) =>
                    name === 'cost' ? [formatCurrency(value), 'Cost'] : [`${value} L`, 'Volume']
                  }
                />
                <Line type="monotone" dataKey="cost" stroke="var(--chart-1)" strokeWidth={2} dot={false} name="cost" />
                <Line type="monotone" dataKey="volume" stroke="var(--chart-2)" strokeWidth={2} dot={false} name="volume" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-2 text-caption text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-chart-1" /> Cost
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-chart-2" /> Volume (L)
            </span>
          </div>
        </>
      )}
    </DashboardWidget>
  );
}