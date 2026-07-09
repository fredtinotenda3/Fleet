// frontend/modules/fuel/components/FuelMonthlyTrendChart.tsx

'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useMonthlyFuelConsumption } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';

export function FuelMonthlyTrendChart() {
  const { data: monthlyData, isLoading, error } = useMonthlyFuelConsumption(12);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Monthly fuel consumption</CardTitle></CardHeader>
        <CardContent><div className="rounded-lg h-55 skeleton" /></CardContent>
      </Card>
    );
  }

  if (error || !monthlyData || monthlyData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monthly fuel consumption</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly fuel consumption</CardTitle>
        <CardDescription>Last 12 months</CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={monthlyData} margin={{ left: -20, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                formatter={(value: number, name: string) =>
                  name === 'cost' ? [formatCurrency(value), 'Cost'] : [`${value.toFixed(1)} L`, 'Volume']
                }
              />
              <Line type="monotone" dataKey="cost" stroke="var(--chart-1)" strokeWidth={2} dot={false} name="cost" />
              <Line type="monotone" dataKey="fuel" stroke="var(--chart-2)" strokeWidth={2} dot={false} name="fuel" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 mt-2 text-caption text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-chart-1" /> Cost</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-chart-2" /> Volume (L)</span>
        </div>
      </CardContent>
    </Card>
  );
}