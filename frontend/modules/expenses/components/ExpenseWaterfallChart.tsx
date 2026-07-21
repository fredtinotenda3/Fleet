// frontend/modules/expenses/components/ExpenseWaterfallChart.tsx

'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useExpenseCategorySummary, useExpenseTypes } from '../hooks/useExpenses';
import { useExpenseDrawer } from '../hooks/useExpenseDrawer';
import { ExpenseTransactionDrawer } from './ExpenseTransactionDrawer';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';

interface ExpenseWaterfallChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

interface WaterfallStep {
  name: string;
  /** Invisible spacer bar that pushes the visible segment to the right height. */
  base: number;
  /** The visible colored segment. */
  value: number;
  isTotal: boolean;
  category?: string;
}

function WaterfallTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload.find((p: any) => p.dataKey === 'value')?.payload as WaterfallStep | undefined;
  if (!row) return null;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{row.name}</p>
      <p className="text-xs text-muted-foreground">
        {row.isTotal ? 'Grand total' : 'Contribution'}: <span className="font-medium text-foreground">{formatCurrency(row.value)}</span>
      </p>
      {!row.isTotal && <p className="pt-1 text-caption text-muted-foreground">Click to view transactions</p>}
    </div>
  );
}

export function ExpenseWaterfallChart({ dateRange }: ExpenseWaterfallChartProps) {
  const { data: summary, isLoading, error } = useExpenseCategorySummary(dateRange);
  const { data: expenseTypes } = useExpenseTypes();
  const { open, setOpen, filter, openDrawer } = useExpenseDrawer();

  const steps = useMemo<WaterfallStep[]>(() => {
    if (!summary || summary.length === 0) return [];
    const sorted = [...summary].sort((a, b) => b.total - a.total);
    let running = 0;
    const rows: WaterfallStep[] = sorted.map((s) => {
      const step: WaterfallStep = { name: s.category, base: running, value: s.total, isTotal: false, category: s.category };
      running += s.total;
      return step;
    });
    rows.push({ name: 'Grand total', base: 0, value: running, isTotal: true });
    return rows;
  }, [summary]);

  function handleClick(step: WaterfallStep) {
    if (step.isTotal) return;
    const type = expenseTypes?.find((t) => t.name === step.category);
    openDrawer({ label: step.name, type: type?._id, startDate: dateRange.startDate, endDate: dateRange.endDate });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Executive expense waterfall</CardTitle>
          <CardDescription>How total spend is composed, category by category</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg h-72 skeleton" />
          ) : error || steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses in this range.</p>
          ) : (
            <div style={{ width: '100%', height: 340 }}>
              <ResponsiveContainer>
                <BarChart data={steps} margin={{ left: -10, right: 12, top: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={10} interval={0} angle={-30} textAnchor="end" height={70} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip content={<WaterfallTooltip />} />
                  <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
                  <Bar dataKey="value" stackId="waterfall" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(entry: any) => handleClick(entry)}>
                    {steps.map((s) => (
                      <Cell key={s.name} fill={s.isTotal ? 'var(--foreground)' : 'var(--chart-1)'} />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="top"
                      formatter={(v: number) => formatCurrency(v)}
                      style={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    />
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