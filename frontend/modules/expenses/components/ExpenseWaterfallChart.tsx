'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useExpenseStats, useExpenseTypes } from '../hooks/useExpenses';
import { useExpenseDrawer } from '../hooks/useExpenseDrawer';
import { ExpenseTransactionDrawer } from './ExpenseTransactionDrawer';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';

interface ExpenseWaterfallChartProps {
  dateRange: ExpenseAnalyticsDateRange;
  /** Vehicle-Level Analytics: scope this chart to a single vehicle instead of the fleet. */
  licensePlate?: string;
}

interface WaterfallRow {
  category: string;
  spend: number;
  /** Invisible base segment so the visible bar "floats" at the right height */
  base: number;
  isTotal?: boolean;
}

function WaterfallTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload.find((p: any) => p.dataKey === 'spend')?.payload as WaterfallRow | undefined;
  if (!row) return null;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{row.category}</p>
      <p className="text-xs text-muted-foreground">
        {row.isTotal ? 'Total' : 'Spend'}:{' '}
        <span className="font-medium text-foreground">{formatCurrency(row.spend)}</span>
      </p>
      {!row.isTotal && <p className="pt-1 text-caption text-muted-foreground">Click to view transactions</p>}
    </div>
  );
}

export function ExpenseWaterfallChart({ dateRange, licensePlate }: ExpenseWaterfallChartProps) {
  const { data: stats, isLoading, error } = useExpenseStats(dateRange, licensePlate);
  const { data: expenseTypes } = useExpenseTypes();
  const { open, setOpen, filter, openDrawer } = useExpenseDrawer();

  const chartData = useMemo<WaterfallRow[]>(() => {
    if (!stats) return [];
    const entries = Object.entries(stats.byType).sort(([, a], [, b]) => b - a);
    let running = 0;
    const rows: WaterfallRow[] = entries.map(([category, spend]) => {
      const base = running;
      running += spend;
      return { category, spend, base };
    });
    rows.push({ category: 'Total', spend: running, base: 0, isTotal: true });
    return rows;
  }, [stats]);

  function handleClick(row: WaterfallRow) {
    if (row.isTotal) return;
    const type = expenseTypes?.find((t) => t.name === row.category);
    openDrawer({ label: row.category, type: type?._id, startDate: dateRange.startDate, endDate: dateRange.endDate, license_plate: licensePlate });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Spend waterfall</CardTitle>
          <CardDescription>How each category builds up to total spend &mdash; click a bar for transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg h-72 skeleton" />
          ) : error || chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses in this range.</p>
          ) : (
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ left: -10, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="category" stroke="var(--muted-foreground)" fontSize={10} interval={0} angle={-30} textAnchor="end" height={60} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip content={<WaterfallTooltip />} />
                  {/* invisible base to float the visible segment */}
                  <Bar dataKey="base" stackId="waterfall" fill="transparent" />
                  <Bar
                    dataKey="spend"
                    stackId="waterfall"
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                    onClick={(entry: any) => handleClick(entry)}
                  >
                    {chartData.map((row, i) => (
                      <Cell key={row.category} fill={row.isTotal ? 'var(--chart-1)' : 'var(--chart-2)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      <ExpenseTransactionDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}