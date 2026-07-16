// frontend/modules/fuel/components/FuelTypeDistributionChart.tsx
// Enterprise analytics #6

'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useFuelTypeDistribution } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

interface FuelTypeDistributionChartProps {
  dateRange: FuelAnalyticsDateRange;
}

export function FuelTypeDistributionChart({ dateRange }: FuelTypeDistributionChartProps) {
  const { data, isLoading, error } = useFuelTypeDistribution(dateRange);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fuel type distribution</CardTitle>
        <CardDescription>Share of litres purchased, by fuel type</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fuel entries in this range.</p>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="litres"
                  nameKey="fuelType"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                  formatter={(value: number, _name, props) => [
                    `${value.toFixed(1)} L (${props.payload.percentage}%) \u00B7 ${formatCurrency(props.payload.cost)}`,
                    props.payload.fuelType,
                  ]}
                />
                <Legend
                  formatter={(value, entry) => {
                    const payload = (entry as any)?.payload;
                    return `${value}${payload ? ` (${payload.percentage}%)` : ''}`;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}