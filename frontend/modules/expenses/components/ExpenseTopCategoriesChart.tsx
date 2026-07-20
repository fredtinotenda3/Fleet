// frontend/modules/expenses/components/ExpenseTopCategoriesChart.tsx

'use client';

import { useRouter } from 'next/navigation';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useExpenseStats, useExpenseTypes } from '../hooks/useExpenses';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { getChartColor } from '@/shared/utils/chart.utils';
import { EXPENSE_ROUTES } from '../routes';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';

interface ExpenseTopCategoriesChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

function TopCategoriesTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as { name: string; amount: number };
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5">
      <p className="text-sm font-medium">{row.name}</p>
      <p className="text-xs text-muted-foreground">
        Total spend: <span className="font-medium text-foreground">{formatCurrency(row.amount)}</span>
      </p>
    </div>
  );
}

export function ExpenseTopCategoriesChart({ dateRange }: ExpenseTopCategoriesChartProps) {
  const router = useRouter();
  const { data: stats, isLoading, error } = useExpenseStats(dateRange);
  const { data: expenseTypes } = useExpenseTypes();

  const rows = (stats?.topCategories ?? []).slice(0, 8);

  function handleClick(name: string) {
    const type = expenseTypes?.find((t) => t.name === name);
    const params = new URLSearchParams();
    if (type?._id) params.set('type', type._id);
    if (dateRange.startDate) params.set('start', dateRange.startDate.toISOString());
    if (dateRange.endDate) params.set('end', dateRange.endDate.toISOString());
    router.push(`${EXPENSE_ROUTES.list}?${params.toString()}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top expense categories</CardTitle>
        <CardDescription>Ranked by total spend -- click a bar to see those expenses</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses in this range.</p>
        ) : (
          <div style={{ width: '100%', height: Math.max(220, rows.length * 40) }}>
            <ResponsiveContainer>
              <BarChart data={rows} layout="vertical" margin={{ left: 12, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} width={120} />
                <Tooltip content={<TopCategoriesTooltip />} />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(entry: any) => handleClick(entry.name)}>
                  {rows.map((row, i) => (
                    <Cell key={row.name} fill={getChartColor(i)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}