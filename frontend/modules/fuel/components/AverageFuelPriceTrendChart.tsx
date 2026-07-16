// frontend/modules/fuel/components/AverageFuelPriceTrendChart.tsx
// Enterprise analytics #5

'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useAverageFuelPriceTrend } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';

interface AverageFuelPriceTrendChartProps {
  dateRange: FuelAnalyticsDateRange;
}

export function AverageFuelPriceTrendChart({ dateRange }: AverageFuelPriceTrendChartProps) {
  const { data, isLoading, error } = useAverageFuelPriceTrend(dateRange, 'month');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Average fuel price trend</CardTitle>
        <CardDescription>Average cost per litre, by month</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fuel entries in this range.</p>
        ) : (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={data} margin={{ left: -10, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="period" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                  formatter={(value: number) => [formatCurrency(value), 'Avg. cost / L']}
                />
                <Line type="monotone" dataKey="avgCostPerLitre" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}