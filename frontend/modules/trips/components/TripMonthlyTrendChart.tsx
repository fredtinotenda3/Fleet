// frontend/modules/trips/components/TripMonthlyTrendChart.tsx
//
// PHASE 2 enterprise analytics -- mirrors FuelMonthlyTrendChart.tsx.

'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useMonthlyTripTrend } from '../hooks/useTripAnalytics';
import { formatDistance } from '@/shared/utils/distance.utils';

export function TripMonthlyTrendChart() {
  const { data: monthlyData, isLoading, error } = useMonthlyTripTrend(12);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Monthly trip trend</CardTitle></CardHeader>
        <CardContent><div className="rounded-lg h-65 skeleton" /></CardContent>
      </Card>
    );
  }

  if (error || !monthlyData || monthlyData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monthly trip trend</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly trip trend</CardTitle>
        <CardDescription>Trips, distance, and driving hours -- last 12 months</CardDescription>
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
                formatter={(value: number, name: string) => {
                  if (name === 'distance') return [formatDistance(value), 'Distance'];
                  if (name === 'drivingHours') return [`${value.toFixed(1)} h`, 'Driving hours'];
                  return [value, 'Trips'];
                }}
              />
              <Line type="monotone" dataKey="trips" stroke="var(--chart-1)" strokeWidth={2} dot={false} name="trips" />
              <Line type="monotone" dataKey="distance" stroke="var(--chart-2)" strokeWidth={2} dot={false} name="distance" />
              <Line type="monotone" dataKey="drivingHours" stroke="var(--chart-3)" strokeWidth={2} dot={false} name="drivingHours" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 mt-2 text-caption text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-chart-1" /> Trips</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-chart-2" /> Distance</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-chart-3" /> Driving hours</span>
        </div>
      </CardContent>
    </Card>
  );
}