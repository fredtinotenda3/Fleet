// frontend/modules/fuel/components/FuelCostDistributionChart.tsx
// Enterprise analytics #9 (histogram)

'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useFuelCostDistribution } from '../hooks/useFuel';
import { useFuelDrawer } from '../hooks/useFuelDrawer';
import { FuelLogDrawer } from './FuelLogDrawer';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';

interface FuelCostDistributionChartProps {
  dateRange: FuelAnalyticsDateRange;
  /** Vehicle-Level Analytics: scope this chart to a single vehicle instead of the fleet. */
  licensePlate?: string;
}

interface BucketDatum {
  min: number;
  max: number;
  count: number;
  label: string;
  percentage: number;
}

function DistributionTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as BucketDatum;
  return (
    <div
      style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
      className="p-2.5 space-y-0.5"
    >
      <p className="text-sm font-medium">{row.label}</p>
      <p className="text-xs text-muted-foreground">
        Transactions: <span className="font-medium text-foreground">{row.count}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Share of total: <span className="font-medium text-foreground">{row.percentage}%</span>
      </p>
      <p className="pt-1 text-caption text-muted-foreground">Click to view fuel logs in this range</p>
    </div>
  );
}

export function FuelCostDistributionChart({ dateRange, licensePlate }: FuelCostDistributionChartProps) {
  const { data, isLoading, error } = useFuelCostDistribution(dateRange, licensePlate);
  const { open, setOpen, filter, openDrawer } = useFuelDrawer();

  const chartData = useMemo<BucketDatum[]>(() => {
    const buckets = data ?? [];
    const total = buckets.reduce((sum, b) => sum + b.count, 0);
    return buckets.map((bucket) => ({
      ...bucket,
      label: `${formatCurrency(bucket.min)}\u2013${formatCurrency(bucket.max)}`,
      percentage: total > 0 ? Math.round((bucket.count / total) * 1000) / 10 : 0,
    }));
  }, [data]);

  // The fuel log list endpoint has no min/max cost filter, so a bucket
  // click can't be scoped to that exact cost range server-side. It still
  // opens the drawer scoped to the chart's own date range/vehicle so the
  // underlying transactions are one click away -- just not bucket-filtered.
  function handleClick(row: BucketDatum) {
    openDrawer({
      label: `Fuel logs ${row.label}`,
      license_plate: licensePlate,
      startDate: dateRange?.startDate,
      endDate: dateRange?.endDate,
    });
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Fuel cost distribution</CardTitle>
            <CardDescription>Transactions grouped by cost range -- flags unusually expensive purchases</CardDescription>
          </div>
          {chartData.length > 0 && (
            <ChartExportButton
              filename={slugifyChartFilename('fuel-cost-distribution')}
              sheetName="Fuel Cost Distribution"
              headers={['Range', 'Transactions', 'Share of Total (%)']}
              rows={chartData.map((r) => ({ Range: r.label, Transactions: r.count, 'Share of Total (%)': r.percentage }))}
            />
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg h-60 skeleton" />
          ) : error || chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No fuel entries in this range.</p>
          ) : (
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={10} interval={0} angle={-30} textAnchor="end" height={60} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                  <Tooltip content={<DistributionTooltip />} />
                  <Bar dataKey="count" fill="var(--chart-5)" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(entry: any) => handleClick(entry)} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      <FuelLogDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}