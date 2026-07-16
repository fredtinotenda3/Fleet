// frontend/modules/fuel/components/FuelFrequencyByVehicleChart.tsx
// Enterprise analytics #7

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useFuelingFrequencyByVehicle } from '../hooks/useFuel';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';

interface FuelFrequencyByVehicleChartProps {
  dateRange: FuelAnalyticsDateRange;
}

export function FuelFrequencyByVehicleChart({ dateRange }: FuelFrequencyByVehicleChartProps) {
  const { data, isLoading, error } = useFuelingFrequencyByVehicle(dateRange, 20);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fueling frequency by vehicle</CardTitle>
        <CardDescription>Number of fuel events per vehicle -- useful for spotting abnormal fueling behaviour</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fuel entries in this range.</p>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={data} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="license_plate" stroke="var(--muted-foreground)" fontSize={11} interval={0} angle={-35} textAnchor="end" height={60} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                  formatter={(value: number) => [value, 'Fuel events']}
                />
                <Bar dataKey="count" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}