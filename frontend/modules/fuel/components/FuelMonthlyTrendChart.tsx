// frontend/modules/fuel/components/FuelMonthlyTrendChart.tsx

'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useMonthlyFuelConsumption } from '../hooks/useFuel';
import { useFuelDrawer } from '../hooks/useFuelDrawer';
import { FuelLogDrawer } from './FuelLogDrawer';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { MonthlyFuelConsumptionPoint } from '../types';

interface FuelMonthlyTrendChartProps {
  /** Vehicle-Level Analytics: scope this chart to a single vehicle instead of the fleet. */
  licensePlate?: string;
}

/** "2026-07" -> { startDate: Jul 1 00:00, endDate: Aug 1 00:00 (exclusive) } */
function monthRange(month: string): { startDate: Date; endDate: Date } {
  const [y, m] = month.split('-').map(Number);
  const startDate = new Date(Date.UTC(y, (m || 1) - 1, 1));
  const endDate = new Date(Date.UTC(y, (m || 1), 1));
  return { startDate, endDate };
}

/** "2026-07" -> "Jul 2026" */
function monthLabel(month: string): string {
  const { startDate } = monthRange(month);
  return startDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function MonthlyTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as MonthlyFuelConsumptionPoint;
  return (
    <div
      style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
      className="p-2.5 space-y-0.5"
    >
      <p className="text-sm font-medium">{monthLabel(row.month)}</p>
      <p className="text-xs text-muted-foreground">
        Total cost: <span className="font-medium text-foreground">{formatCurrency(row.cost)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Total volume: <span className="font-medium text-foreground">{row.fuel.toFixed(1)} L</span>
      </p>
      <p className="pt-1 text-caption text-muted-foreground">Click to view fuel logs</p>
    </div>
  );
}

export function FuelMonthlyTrendChart({ licensePlate }: FuelMonthlyTrendChartProps = {}) {
  const { data: monthlyData, isLoading, error } = useMonthlyFuelConsumption(12, licensePlate);
  const { open, setOpen, filter, openDrawer } = useFuelDrawer();

  function handleClick(row: MonthlyFuelConsumptionPoint) {
    const { startDate, endDate } = monthRange(row.month);
    openDrawer({ label: `${monthLabel(row.month)} fuel logs`, license_plate: licensePlate, startDate, endDate });
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Monthly fuel consumption</CardTitle></CardHeader>
        <CardContent><div className="rounded-lg h-55 skeleton" /></CardContent>
      </Card>
    );
  }

  if (error || !monthlyData || monthlyData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monthly fuel consumption</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Monthly fuel consumption</CardTitle>
            <CardDescription>Last 12 months &mdash; click a point for details</CardDescription>
          </div>
          <ChartExportButton
            filename={slugifyChartFilename('fuel-monthly-consumption')}
            sheetName="Monthly Fuel"
            headers={['Month', 'Total Cost', 'Total Volume (L)']}
            rows={monthlyData.map((r) => ({
              Month: monthLabel(r.month),
              'Total Cost': r.cost,
              'Total Volume (L)': r.fuel,
            }))}
          />
        </CardHeader>
        <CardContent>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={monthlyData} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tickFormatter={monthLabel} stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip content={<MonthlyTooltip />} />
                <Line
                  type="monotone"
                  dataKey="cost"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  name="cost"
                  dot={{ r: 3, cursor: 'pointer' }}
                  activeDot={{ r: 5, cursor: 'pointer', onClick: (_: any, e: any) => handleClick(e.payload) }}
                />
                <Line
                  type="monotone"
                  dataKey="fuel"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  name="fuel"
                  dot={{ r: 3, cursor: 'pointer' }}
                  activeDot={{ r: 5, cursor: 'pointer', onClick: (_: any, e: any) => handleClick(e.payload) }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-2 text-caption text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-chart-1" /> Cost</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-chart-2" /> Volume (L)</span>
          </div>
        </CardContent>
      </Card>
      <FuelLogDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}
