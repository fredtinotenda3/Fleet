//frontend/modules/trips/components/DriverUtilizationChart.tsx

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useDriverUtilization } from '../hooks/useTripAnalytics';
import { formatDistance } from '@/shared/utils/distance.utils';
import type { TripDrawerFilter } from './TripTransactionDrawer';
import type { TripUtilizationSort } from '../types';

interface DriverUtilizationChartProps {
  dateRange?: { startDate?: Date; endDate?: Date };
  sortBy?: TripUtilizationSort;
  onDrillDown?: (filter: TripDrawerFilter) => void;
}

export function DriverUtilizationChart({ dateRange, sortBy = 'trips', onDrillDown }: DriverUtilizationChartProps) {
  const { data, isLoading, error } = useDriverUtilization(dateRange, 15, sortBy);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Driver utilization</CardTitle></CardHeader>
        <CardContent><div className="rounded-lg h-65 skeleton" /></CardContent>
      </Card>
    );
  }

  if (error || !data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Driver utilization</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Driver utilization</CardTitle>
        <CardDescription>Trips and distance by driver -- click a bar to drill down</CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis type="category" dataKey="driverName" stroke="var(--muted-foreground)" fontSize={11} width={100} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                formatter={(value: number, name: string) =>
                  name === 'totalDistance' ? [formatDistance(value), 'Distance'] : [value, 'Trips']
                }
              />
              <Bar
                dataKey={sortBy === 'distance' ? 'totalDistance' : 'trips'}
                radius={[0, 4, 4, 0]}
                cursor={onDrillDown ? 'pointer' : undefined}
                onClick={(entry: any) =>
                  onDrillDown?.({
                    label: entry.driverName,
                    driver_id: entry.driver_id ?? undefined,
                    startDate: dateRange?.startDate,
                    endDate: dateRange?.endDate,
                  })
                }
              >
                {data.map((row) => (
                  <Cell key={row.driver_id ?? 'unassigned'} fill="var(--chart-2)" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
