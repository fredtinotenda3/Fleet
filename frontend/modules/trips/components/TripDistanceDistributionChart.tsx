// frontend/modules/trips/components/TripDistanceDistributionChart.tsx
//
// VEHICLE-SCOPE ADDITION: optional `licensePlate` prop, forwarded to
// useTripDistanceDistribution.

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useTripDistanceDistribution } from '../hooks/useTripAnalytics';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import type { TripDrawerFilter } from './TripTransactionDrawer';

interface TripDistanceDistributionChartProps {
  dateRange?: { startDate?: Date; endDate?: Date };
  licensePlate?: string;
  onDrillDown?: (filter: TripDrawerFilter) => void;
}

interface BucketDatum {
  label: string;
  count: number;
  min: number;
  max: number;
}

function DistanceTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as BucketDatum;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{row.label}</p>
      <p className="text-xs text-muted-foreground">Trips: <span className="font-medium text-foreground">{row.count}</span></p>
      <p className="pt-1 text-caption text-muted-foreground">Click to view trips in this range</p>
    </div>
  );
}

export function TripDistanceDistributionChart({ dateRange, licensePlate, onDrillDown }: TripDistanceDistributionChartProps) {
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

  const chartData: BucketDatum[] = data.map((b) => ({
    label: `${b.min.toFixed(0)}\u2013${b.max.toFixed(0)} km`,
    count: b.count,
    min: b.min,
    max: b.max,
  }));

  // No distance-range filter on the trip list endpoint, so a bucket click
  // opens the drawer scoped to this chart's date range/vehicle rather than
  // the exact bucket -- still one click away from the underlying trips.
  function handleClick(row: BucketDatum) {
    onDrillDown?.({
      label: `Trips ${row.label}`,
      license_plate: licensePlate,
      startDate: dateRange?.startDate,
      endDate: dateRange?.endDate,
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Distance distribution</CardTitle>
          <CardDescription>
            {licensePlate ? 'Number of this vehicle\u2019s trips by distance range' : 'Number of trips by distance range'}
            {onDrillDown ? ' -- click a bar for details' : ''}
          </CardDescription>
        </div>
        <ChartExportButton
          filename={slugifyChartFilename('trip-distance-distribution')}
          sheetName="Distance Distribution"
          headers={['Range', 'Trips']}
          rows={chartData.map((r) => ({ Range: r.label, Trips: r.count }))}
        />
      </CardHeader>
      <CardContent>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ left: -20, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={10} interval={0} angle={-25} textAnchor="end" height={60} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
              <Tooltip content={<DistanceTooltip />} />
              <Bar
                dataKey="count"
                fill="var(--chart-3)"
                radius={[4, 4, 0, 0]}
                cursor={onDrillDown ? 'pointer' : undefined}
                onClick={(entry: any) => handleClick(entry)}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
