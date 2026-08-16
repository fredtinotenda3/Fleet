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

/** "2026-07" (month granularity) -> { startDate, endDate }; falls back to the chart's range otherwise. */
function monthRange(period: string, fallback?: FuelAnalyticsDateRange): { startDate?: Date; endDate?: Date } {
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split('-').map(Number);
    return { startDate: new Date(Date.UTC(y, m - 1, 1)), endDate: new Date(Date.UTC(y, m, 1)) };
  }
  return { startDate: fallback?.startDate, endDate: fallback?.endDate };
}

function PriceTooltip({ active, payload, label }: any) {
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

export function AverageFuelPriceTrendChart({ dateRange, licensePlate }: AverageFuelPriceTrendChartProps) {
  const { data, isLoading, error } = useAverageFuelPriceTrend(dateRange, 'month', licensePlate);
  const { open, setOpen, filter, openDrawer } = useFuelDrawer();

  function handleClick(row: FuelPriceTrendPoint) {
    const { startDate, endDate } = monthRange(row.period, dateRange);
    openDrawer({ label: `${row.period} fuel logs`, license_plate: licensePlate, startDate, endDate });
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Average fuel price trend</CardTitle>
            <CardDescription>Average cost per litre, by month &mdash; click a point for details</CardDescription>
          </div>
          {data && data.length > 0 && (
            <ChartExportButton
              filename={slugifyChartFilename('average-fuel-price-trend')}
              sheetName="Avg Fuel Price"
              headers={['Period', 'Avg Cost / L']}
              rows={data.map((r) => ({ Period: r.period, 'Avg Cost / L': r.avgCostPerLitre }))}
            />
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg h-60 skeleton" />
          ) : error || !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No fuel entries in this range.</p>
          ) : (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={data} margin={{ left: -10, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="period" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip content={<PriceTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="avgCostPerLitre"
                    stroke="var(--chart-3)"
                    strokeWidth={2}
                    dot={{ r: 3, cursor: 'pointer' }}
                    activeDot={{ r: 5, cursor: 'pointer', onClick: (_: any, e: any) => handleClick(e.payload) }}
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
