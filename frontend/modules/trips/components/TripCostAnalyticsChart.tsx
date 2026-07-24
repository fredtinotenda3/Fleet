// frontend/modules/trips/components/TripCostAnalyticsChart.tsx
//
// PHASE 3: Cost vs Distance scatter -- each point is one linked trip.
// Only renders trips that have at least one linked fuel log or
// expense (unlinked trips have no cost to plot).

'use client';

import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useTripCostAnalytics, useTripCostSummary } from '../hooks/useTripCostAnalytics';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { formatDistance } from '@/shared/utils/distance.utils';

interface TripCostAnalyticsChartProps {
  dateRange?: { startDate?: Date; endDate?: Date };
}

export function TripCostAnalyticsChart({ dateRange }: TripCostAnalyticsChartProps) {
  const { data, isLoading, error } = useTripCostAnalytics(dateRange, 200);
  const { data: summary } = useTripCostSummary(dateRange);

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
            No trips are linked to fuel logs or expenses yet. Link a trip when logging fuel
            or an expense to see cost-per-trip analytics here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost vs. distance</CardTitle>
        <CardDescription>
          {summary
            ? `${summary.linkedTripCount} linked trips \u00B7 avg ${formatCurrency(summary.averageCostPerTrip)}/trip \u00B7 ${formatCurrency(summary.averageCostPerKm)}/km`
            : 'Each point is one trip with linked fuel or expense records'}
        </CardDescription>
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
              />
              <Scatter data={data} fill="var(--chart-4)" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}