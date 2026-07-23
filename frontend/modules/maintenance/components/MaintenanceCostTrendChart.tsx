//frontend/modules/maintenance/components/MaintenanceCostTrendChart.tsx

'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useMaintenanceCostTrend } from '../hooks/useMaintenance';
import { formatCurrency } from '@/shared/utils/currency.utils';

export function MaintenanceCostTrendChart() {
  const { data, isLoading, error } = useMaintenanceCostTrend(12);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Maintenance cost trend</CardTitle>
        <CardDescription>Estimated cost of completed maintenance, by month</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No completed maintenance in this range.</p>
        ) : (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={data} margin={{ left: -10, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                  formatter={(value: number, name: string) =>
                    name === 'totalCost' ? [formatCurrency(value), 'Cost'] : [value, 'Records']
                  }
                />
                <Line type="monotone" dataKey="totalCost" stroke="var(--chart-1)" strokeWidth={2} dot={false} name="totalCost" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}