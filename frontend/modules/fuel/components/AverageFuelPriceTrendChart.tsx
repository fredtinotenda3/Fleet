// frontend/modules/fuel/components/AverageFuelPriceTrendChart.tsx
// Enterprise analytics #5

'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useAverageFuelPriceTrend } from '../hooks/useFuel';
import { useFuelDrawer } from '../hooks/useFuelDrawer';
import { FuelLogDrawer } from './FuelLogDrawer';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';
import type { FuelPriceTrendPoint } from '../types';

interface AverageFuelPriceTrendChartProps {
  dateRange: FuelAnalyticsDateRange;
  /** Vehicle-Level Analytics: scope this chart to a single vehicle instead of the fleet. */
  licensePlate?: string;
}

function PriceTrendTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as FuelPriceTrendPoint;
  return (
    <div
      style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
      className="p-2.5 space-y-0.5"
    >
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">
        Avg. cost / L: <span className="font-medium text-foreground">{formatCurrency(row.avgCostPerLitre)}</span>
      </p>
      <p className="pt-1 text-caption text-muted-foreground">Click to view fuel logs</p>
    </div>
  );
}

/** "2026-01" -> { startDate: Jan 1 2026, endDate: Jan 31 2026 }. Falls back gracefully for
 *  non-monthly period strings (e.g. plain years) by leaving the range undefined so the
 *  drawer simply falls back to the chart's own date range. */
function monthPeriodToRange(period: string): { startDate?: Date; endDate?: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return {};
  const [, year, month] = match;
  const startDate = new Date(Number(year), Number(month) - 1, 1);
  const endDate = new Date(Number(year), Number(month), 0);
  return { startDate, endDate };
}

export function AverageFuelPriceTrendChart({ dateRange, licensePlate }: AverageFuelPriceTrendChartProps) {
  const { data, isLoading, error } = useAverageFuelPriceTrend(dateRange, 'month', licensePlate);
  const { open, setOpen, filter, openDrawer } = useFuelDrawer();

  function handleClick(row: FuelPriceTrendPoint) {
    const { startDate, endDate } = monthPeriodToRange(row.period);
    openDrawer({
      label: `Fuel prices \u2014 ${row.period}`,
      license_plate: licensePlate,
      startDate: startDate ?? dateRange?.startDate,
      endDate: endDate ?? dateRange?.endDate,
    });
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Average fuel price trend</CardTitle>
            <CardDescription>Average cost per litre, by month &mdash; click a point for details</CardDescription>
          </div>
          <ChartExportButton
            filename={slugifyChartFilename('average-fuel-price-trend')}
            sheetName="Avg Fuel Price Trend"
            headers={['Period', 'Avg. Cost / L']}
            rows={(data ?? []).map((r) => ({ Period: r.period, 'Avg. Cost / L': r.avgCostPerLitre }))}
          />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg h-60 skeleton" />
          ) : error || !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No fuel entries in this range.</p>
          ) : (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <LineChart
                  data={data}
                  margin={{ left: -10, right: 8 }}
                  onClick={(state: any) => {
                    const point = state?.activePayload?.[0]?.payload;
                    if (point) handleClick(point);
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="period" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip content={<PriceTrendTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="avgCostPerLitre"
                    stroke="var(--chart-3)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    cursor="pointer"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      <FuelLogDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}