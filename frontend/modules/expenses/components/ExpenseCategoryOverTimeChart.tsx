// frontend/modules/expenses/components/ExpenseCategoryOverTimeChart.tsx

'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useExpenseCategoryOverTime, useExpenseTypes } from '../hooks/useExpenses';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { getChartColor } from '@/shared/utils/chart.utils';
import { EXPENSE_ROUTES } from '../routes';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';

interface ExpenseCategoryOverTimeChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

function CategoryOverTimeTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const total = payload.reduce((sum: number, p: any) => sum + (p.value || 0), 0);
  return (
    <div
      style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
      className="p-2.5 space-y-1"
    >
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">
        Total: <span className="font-medium text-foreground">{formatCurrency(total)}</span>
      </p>
      {payload
        .filter((p: any) => p.value > 0)
        .sort((a: any, b: any) => b.value - a.value)
        .map((p: any) => (
          <p key={p.dataKey} className="text-xs text-muted-foreground">
            {p.name}: <span className="font-medium text-foreground">{formatCurrency(p.value)}</span>{' '}
            ({total > 0 ? ((p.value / total) * 100).toFixed(1) : '0.0'}%)
          </p>
        ))}
    </div>
  );
}

export function ExpenseCategoryOverTimeChart({ dateRange }: ExpenseCategoryOverTimeChartProps) {
  const router = useRouter();
  const { data, isLoading, error } = useExpenseCategoryOverTime(dateRange);
  const { data: expenseTypes } = useExpenseTypes();

  const { chartData, categories } = useMemo(() => {
    if (!data || data.length === 0) return { chartData: [], categories: [] as string[] };

    const categorySet = new Set<string>();
    const byMonth = new Map<string, Record<string, number>>();

    for (const point of data) {
      categorySet.add(point.category);
      if (!byMonth.has(point.month)) byMonth.set(point.month, {});
      byMonth.get(point.month)![point.category] = point.amount;
    }

    const cats = Array.from(categorySet);
    const rows = Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, values]) => ({ month, ...values }));

    return { chartData: rows, categories: cats };
  }, [data]);

  function handleBarClick(category: string, month: string) {
    const type = expenseTypes?.find((t) => t.name === category);
    const [year, m] = month.split('-');
    const startDate = new Date(Number(year), Number(m) - 1, 1);
    const endDate = new Date(Number(year), Number(m), 0);
    const params = new URLSearchParams();
    if (type?._id) params.set('type', type._id);
    params.set('start', startDate.toISOString());
    params.set('end', endDate.toISOString());
    router.push(`${EXPENSE_ROUTES.list}?${params.toString()}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Expense by category over time</CardTitle>
        <CardDescription>Monthly spend, broken down by category -- click a segment to drill into those expenses</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-72 skeleton" />
        ) : error || chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses in this range.</p>
        ) : (
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip content={<CategoryOverTimeTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {categories.map((cat, i) => (
                  <Bar
                    key={cat}
                    dataKey={cat}
                    stackId="expenses"
                    fill={getChartColor(i)}
                    radius={i === categories.length - 1 ? [4, 4, 0, 0] : undefined}
                    cursor="pointer"
                    onClick={(entry: any) => handleBarClick(cat, entry.month)}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}