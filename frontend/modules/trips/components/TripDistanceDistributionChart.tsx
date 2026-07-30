// frontend/modules/trips/components/TripDistanceDistributionChart.tsx
//
// VEHICLE-SCOPE ADDITION: optional `licensePlate` prop, forwarded to
// useTripDistanceDistribution.

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useTripDistanceDistribution } from '../hooks/useTripAnalytics';

interface TripDistanceDistributionChartProps {
  dateRange?: { startDate?: Date; endDate?: Date };
  licensePlate?: string;
}

export function TripDistanceDistributionChart({ dateRange, licensePlate }: TripDistanceDistributionChartProps) {
  const { data, isLoading, error } = useTripDistanceDistribution(dateRange, licensePlate);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Distance distribution</CardTitle></CardHeader>
        <CardContent><div className="rounded-lg h-65 skeleton" /></CardContent>
      </Card>
    );
  }

  if (error || !data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Distance distribution</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const chartData = data.map((b) => ({
    label: `${b.min.toFixed(0)}\u2013${b.max.toFixed(0)} km`,
    count: b.count,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distance distribution</CardTitle>
        <CardDescription>
          {licensePlate ? 'Number of this vehicle\u2019s trips by distance range' : 'Number of trips by distance range'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ left: -20, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={10} interval={0} angle={-25} textAnchor="end" height={60} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                formatter={(value: number) => [value, 'Trips']}
              />
              <Bar dataKey="count" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}