/* eslint-disable @typescript-eslint/no-unused-vars */
// frontend/modules/fuel/components/FuelCostByDriverChart.tsx
// Enterprise analytics #2 -- reuses useFuelByDriver (sortBy='cost')
// rather than a separate query, matching FuelRepository.getFuelByDriver.

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useFuelByDriver } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';

const BAR_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

interface FuelCostByDriverChartProps {
  dateRange: FuelAnalyticsDateRange;
}

export function FuelCostByDriverChart({ dateRange }: FuelCostByDriverChartProps) {
  const { data, isLoading, error } = useFuelByDriver(dateRange, 10, 'cost');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fuel cost by driver</CardTitle>
        <CardDescription>Highest fuel spend, ranked by driver</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No driver-attributed fuel entries in this range.</p>
        ) : (
          <div style={{ width: '100%', height: Math.max(260, data.length * 36) }}>
            <ResponsiveContainer>
              <BarChart data={data} layout="vertical" margin={{ left: 12, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                <YAxis type="category" dataKey="driverName" stroke="var(--muted-foreground)" fontSize={11} width={120} />
                <Tooltip<number, string>
                  contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                  formatter={(value: number, name: string, props) => [
                    name === 'totalCost'
                      ? formatCurrency(value)
                      : `${value.toFixed(1)} L`,
                    name === 'totalCost' ? 'Total cost' : 'Total litres',
                  ]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.driverName ?? ''}
                />
                <Bar dataKey="totalCost" radius={[0, 4, 4, 0]}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}