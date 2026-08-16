// frontend/modules/trips/components/TripMonthlyTrendChart.tsx
//
// PHASE 2 enterprise analytics -- mirrors FuelMonthlyTrendChart.tsx.
//
// VEHICLE-SCOPE ADDITION: optional `licensePlate` prop, forwarded to
// useMonthlyTripTrend, so a single vehicle's monthly trend renders when
// used inside VehicleTripAnalyticsPanel.

'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useMonthlyTripTrend } from '../hooks/useTripAnalytics';
import { formatDistance } from '@/shared/utils/distance.utils';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import type { TripDrawerFilter } from './TripTransactionDrawer';
import type { TripMonthlyTrendPoint } from '../types';

interface TripMonthlyTrendChartProps {
  months?: number;
  licensePlate?: string;
  onDrillDown?: (filter: TripDrawerFilter) => void;
}

function monthRange(month: string): { startDate?: Date; endDate?: Date } {
  if (!/^\d{4}-\d{2}$/.test(month)) return {};
  const [y, m] = month.split('-').map(Number);
  return { startDate: new Date(Date.UTC(y, m - 1, 1)), endDate: new Date(Date.UTC(y, m, 1)) };
}

function MonthlyTripTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as TripMonthlyTrendPoint;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">Trips: <span className="font-medium text-foreground">{row.trips}</span></p>
      <p className="text-xs text-muted-foreground">Distance: <span className="font-medium text-foreground">{formatDistance(row.distance)}</span></p>
      <p className="text-xs text-muted-foreground">Driving hours: <span className="font-medium text-foreground">{row.drivingHours.toFixed(1)} h</span></p>
      <p className="pt-1 text-caption text-muted-foreground">Click to view this month's trips</p>
    </div>
  );
}

export function TripMonthlyTrendChart({ months = 12, licensePlate, onDrillDown }: TripMonthlyTrendChartProps = {}) {
  const { data: monthlyData, isLoading, error } = useMonthlyTripTrend(months, licensePlate);

  function handleClick(row: TripMonthlyTrendPoint) {
    const { startDate, endDate } = monthRange(row.month);
    onDrillDown?.({ label: `${row.month} trips`, license_plate: licensePlate, startDate, endDate });
  }

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
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Monthly trip trend</CardTitle>
          <CardDescription>
            {licensePlate
              ? `Trips, distance, and driving hours for ${licensePlate} -- last ${months} months`
              : `Trips, distance, and driving hours -- last ${months} months`}
            {onDrillDown ? ' \u2014 click a point for details' : ''}
          </CardDescription>
        </div>
        <ChartExportButton
          filename={slugifyChartFilename('monthly-trip-trend')}
          sheetName="Monthly Trip Trend"
          headers={['Month', 'Trips', 'Distance', 'Driving Hours']}
          rows={monthlyData.map((r) => ({ Month: r.month, Trips: r.trips, Distance: r.distance, 'Driving Hours': r.drivingHours }))}
        />
      </CardHeader>
      <CardContent>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={monthlyData} margin={{ left: -20, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip content={<MonthlyTripTooltip />} />
              <Line
                type="monotone"
                dataKey="trips"
                stroke="var(--chart-1)"
                strokeWidth={2}
                name="trips"
                dot={{ r: 3, cursor: onDrillDown ? 'pointer' : undefined }}
                activeDot={{ r: 5, cursor: onDrillDown ? 'pointer' : undefined, onClick: (_: any, e: any) => handleClick(e.payload) }}
              />
              <Line
                type="monotone"
                dataKey="distance"
                stroke="var(--chart-2)"
                strokeWidth={2}
                name="distance"
                dot={{ r: 3, cursor: onDrillDown ? 'pointer' : undefined }}
                activeDot={{ r: 5, cursor: onDrillDown ? 'pointer' : undefined, onClick: (_: any, e: any) => handleClick(e.payload) }}
              />
              <Line
                type="monotone"
                dataKey="drivingHours"
                stroke="var(--chart-3)"
                strokeWidth={2}
                name="drivingHours"
                dot={{ r: 3, cursor: onDrillDown ? 'pointer' : undefined }}
                activeDot={{ r: 5, cursor: onDrillDown ? 'pointer' : undefined, onClick: (_: any, e: any) => handleClick(e.payload) }}
              />
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
