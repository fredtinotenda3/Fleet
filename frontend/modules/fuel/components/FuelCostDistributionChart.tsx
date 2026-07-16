// frontend/modules/fuel/components/FuelCostDistributionChart.tsx
// Enterprise analytics #9 (histogram)

'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useFuelCostDistribution } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';

interface FuelCostDistributionChartProps {
  dateRange: FuelAnalyticsDateRange;
}

export function FuelCostDistributionChart({ dateRange }: FuelCostDistributionChartProps) {
  const { data, isLoading, error } = useFuelCostDistribution(dateRange);

  const chartData = useMemo(
    () =>
      (data ?? []).map((bucket) => ({
        ...bucket,
        label: `${formatCurrency(bucket.min)}\u2013${formatCurrency(bucket.max)}`,
      })),
    [data]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fuel cost distribution</CardTitle>
        <CardDescription>Transactions grouped by cost range -- flags unusually expensive purchases</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fuel entries in this range.</p>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={10} interval={0} angle={-30} textAnchor="end" height={60} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                  formatter={(value: number) => [value, 'Transactions']}
                />
                <Bar dataKey="count" fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}