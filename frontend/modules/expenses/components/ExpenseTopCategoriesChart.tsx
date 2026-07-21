// frontend/modules/expenses/components/ExpenseTopCategoriesChart.tsx

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useExpenseCategorySummary, useExpenseTypes } from '../hooks/useExpenses';
import { useExpenseDrawer } from '../hooks/useExpenseDrawer';
import { ExpenseTransactionDrawer } from './ExpenseTransactionDrawer';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { formatDate } from '@/shared/utils/date.utils';
import { getChartColor } from '@/shared/utils/chart.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';
import type { CategorySummary } from '@/shared/types/expense.types';

interface ExpenseTopCategoriesChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

function TopCategoriesTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as CategorySummary;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-3 space-y-0.5 max-w-64">
      <p className="text-sm font-medium">{row.category}</p>
      <p className="text-xs text-muted-foreground">
        Total: <span className="font-medium text-foreground">{formatCurrency(row.total)}</span> ({row.percentageOfTotal}%)
      </p>
      <p className="text-xs text-muted-foreground">
        {row.count} transactions &middot; avg {formatCurrency(row.average)}
      </p>
      <p className="text-xs text-muted-foreground">
        Range: {formatCurrency(row.min)} \u2013 {formatCurrency(row.max)}
      </p>
      {row.topVehicle && <p className="text-xs text-muted-foreground">Top vehicle: {row.topVehicle}</p>}
      {row.latestDate && <p className="text-xs text-muted-foreground">Latest: {formatDate(row.latestDate)}</p>}
      <p className="pt-1 text-caption text-muted-foreground">Click to view transactions</p>
    </div>
  );
}

export function ExpenseTopCategoriesChart({ dateRange }: ExpenseTopCategoriesChartProps) {
  const { data: summary, isLoading, error } = useExpenseCategorySummary(dateRange);
  const { data: expenseTypes } = useExpenseTypes();
  const { open, setOpen, filter, openDrawer } = useExpenseDrawer();

  const rows = (summary ?? []).slice(0, 8);

  function handleClick(row: CategorySummary) {
    const type = expenseTypes?.find((t) => t.name === row.category);
    openDrawer({
      label: row.category,
      type: type?._id,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Top expense categories</CardTitle>
          <CardDescription>Ranked by total spend &mdash; click a bar for transactions</CardDescription>
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
                  <YAxis type="category" dataKey="category" stroke="var(--muted-foreground)" fontSize={11} width={120} />
                  <Tooltip content={<TopCategoriesTooltip />} />
                  <Bar dataKey="total" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(entry: any) => handleClick(entry)}>
                    {rows.map((row, i) => (
                      <Cell key={row.category} fill={getChartColor(i)} />
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