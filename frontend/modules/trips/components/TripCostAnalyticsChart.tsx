// frontend/modules/trips/components/TripCostAnalyticsChart.tsx
//
// PHASE 3: Cost vs Distance scatter -- each point is one linked trip.
// Only renders trips that have at least one linked fuel log or
// expense (unlinked trips have no cost to plot).
//
// VEHICLE-SCOPE ADDITION: optional `licensePlate` prop, forwarded to
// useTripCostAnalytics / useTripCostSummary.

'use client';

import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useTripCostAnalytics, useTripCostSummary } from '../hooks/useTripCostAnalytics';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { useRouter } from 'next/navigation';
import { formatDistance } from '@/shared/utils/distance.utils';
import { formatDate } from '@/shared/utils/date.utils';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import { TRIP_ROUTES } from '../routes';
import type { TripCostAnalyticsRow } from '../types';

interface TripCostAnalyticsChartProps {
  dateRange?: { startDate?: Date; endDate?: Date };
  licensePlate?: string;
}

export function TripCostAnalyticsChart({ dateRange, licensePlate }: TripCostAnalyticsChartProps) {
  const { data, isLoading, error } = useTripCostAnalytics(dateRange, 200, licensePlate);
  const { data: summary } = useTripCostSummary(dateRange, licensePlate);
  const router = useRouter();

  function handlePointClick(row: TripCostAnalyticsRow) {
    router.push(TRIP_ROUTES.detail(row.tripId));
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Cost vs. distance</CardTitle></CardHeader>
        <CardContent><div className="rounded-lg h-65 skeleton" /></CardContent>
      </Card>
    );
  }

  if (error || !data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cost vs. distance</CardTitle>
          <CardDescription>
            {licensePlate
              ? 'This vehicle has no trips linked to fuel logs or expenses yet. Link a trip when logging fuel or an expense to see cost-per-trip analytics here.'
              : 'No trips are linked to fuel logs or expenses yet. Link a trip when logging fuel or an expense to see cost-per-trip analytics here.'}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Cost vs. distance</CardTitle>
          <CardDescription>
            {summary
              ? `${summary.linkedTripCount} linked trips \u00B7 avg ${formatCurrency(summary.averageCostPerTrip)}/trip \u00B7 ${formatCurrency(summary.averageCostPerKm)}/km \u2014 click a point to open the trip`
              : 'Each point is one trip with linked fuel or expense records -- click a point to open the trip'}
          </CardDescription>
        </div>
        <ChartExportButton
          filename={slugifyChartFilename('trip-cost-vs-distance')}
          sheetName="Cost vs Distance"
          headers={['Trip ID', 'License Plate', 'Date', 'Distance', 'Fuel Cost', 'Expense Cost', 'Total Cost', 'Cost / km']}
          rows={data.map((r) => ({
            'Trip ID': r.tripId,
            'License Plate': r.license_plate,
            Date: formatDate(r.date, 'yyyy-MM-dd'),
            Distance: r.distance,
            'Fuel Cost': r.fuelCost,
            'Expense Cost': r.expenseCost,
            'Total Cost': r.totalCost,
            'Cost / km': r.costPerKm ?? '',
          }))}
        />
      </CardHeader>
      <CardContent>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <ScatterChart margin={{ left: 8, right: 16, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                type="number"
                dataKey="distance"
                name="Distance"
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickFormatter={(v) => formatDistance(v)}
              />
              <YAxis
                type="number"
                dataKey="totalCost"
                name="Total cost"
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickFormatter={(v) => formatCurrency(v)}
              />
              <ZAxis range={[60, 60]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                formatter={(value: number, name: string) =>
                  name === 'Total cost' ? [formatCurrency(value), name] : [formatDistance(value), name]
                }
                labelFormatter={() => ''}
                content={({ active, payload }: any) => {
                  if (!active || !payload || !payload.length) return null;
                  const row = payload[0].payload as TripCostAnalyticsRow;
                  return (
                    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
                      <p className="text-sm font-medium">{row.license_plate} \u2014 {formatDate(row.date)}</p>
                      <p className="text-xs text-muted-foreground">Distance: <span className="font-medium text-foreground">{formatDistance(row.distance)}</span></p>
                      <p className="text-xs text-muted-foreground">Fuel cost: <span className="font-medium text-foreground">{formatCurrency(row.fuelCost)}</span></p>
                      <p className="text-xs text-muted-foreground">Expense cost: <span className="font-medium text-foreground">{formatCurrency(row.expenseCost)}</span></p>
                      <p className="text-xs text-muted-foreground">Total cost: <span className="font-medium text-foreground">{formatCurrency(row.totalCost)}</span></p>
                      {row.costPerKm != null && (
                        <p className="text-xs text-muted-foreground">Cost / km: <span className="font-medium text-foreground">{formatCurrency(row.costPerKm)}</span></p>
                      )}
                      <p className="pt-1 text-caption text-muted-foreground">Click to open this trip</p>
                    </div>
                  );
                }}
              />
              <Scatter data={data} fill="var(--chart-4)" cursor="pointer" onClick={(entry: any) => handlePointClick(entry)} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}