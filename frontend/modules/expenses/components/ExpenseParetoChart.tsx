// frontend/modules/expenses/components/ExpenseParetoChart.tsx

'use client';

import { useMemo } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useExpenseStats, useExpenseTypes } from '../hooks/useExpenses';
import { useExpenseDrawer } from '../hooks/useExpenseDrawer';
import { ExpenseTransactionDrawer } from './ExpenseTransactionDrawer';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';

interface ExpenseParetoChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

interface ParetoRow {
  category: string;
  spend: number;
  cumulativePercent: number;
}

function ParetoTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as ParetoRow;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{row.category}</p>
      <p className="text-xs text-muted-foreground">
        Spend: <span className="font-medium text-foreground">{formatCurrency(row.spend)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Cumulative: <span className="font-medium text-foreground">{row.cumulativePercent.toFixed(1)}%</span>
      </p>
      <p className="pt-1 text-caption text-muted-foreground">Click to view transactions</p>
    </div>
  );
}

export function ExpenseParetoChart({ dateRange }: ExpenseParetoChartProps) {
  const { data: stats, isLoading, error } = useExpenseStats(dateRange);
  const { data: expenseTypes } = useExpenseTypes();
  const { open, setOpen, filter, openDrawer } = useExpenseDrawer();

  const chartData = useMemo<ParetoRow[]>(() => {
    if (!stats) return [];
    const entries = Object.entries(stats.byType).sort(([, a], [, b]) => b - a);
    const total = entries.reduce((sum, [, v]) => sum + v, 0);
    let running = 0;
    return entries.map(([category, spend]) => {
      running += spend;
      return { category, spend, cumulativePercent: total > 0 ? (running / total) * 100 : 0 };
    });
  }, [stats]);

  function handleClick(row: ParetoRow) {
    const type = expenseTypes?.find((t) => t.name === row.category);
    openDrawer({ label: row.category, type: type?._id, startDate: dateRange.startDate, endDate: dateRange.endDate });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Pareto analysis</CardTitle>
          <CardDescription>Which categories drive the majority of cost (80/20 view) &mdash; click a bar for transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg h-72 skeleton" />
          ) : error || chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses in this range.</p>
          ) : (
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <ComposedChart data={chartData} margin={{ left: -10, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="category" stroke="var(--muted-foreground)" fontSize={10} interval={0} angle={-30} textAnchor="end" height={60} />
                  <YAxis yAxisId="spend" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                  <YAxis yAxisId="cumulative" orientation="right" stroke="var(--muted-foreground)" fontSize={11} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip content={<ParetoTooltip />} />
                  <Bar
                    yAxisId="spend"
                    dataKey="spend"
                    fill="var(--chart-2)"
                    radius={[4, 4, 0, 0]}
                    cursor="pointer"
                    onClick={(entry: any) => handleClick(entry)}
                  />
                  <Line yAxisId="cumulative" type="monotone" dataKey="cumulativePercent" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      <ExpenseTransactionDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}