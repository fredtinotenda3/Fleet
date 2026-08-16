// frontend/modules/expenses/components/ExpenseCategoryChart.tsx

'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useExpenseCategorySummary, useExpenseTypes } from '../hooks/useExpenses';
import { useExpenseDrawer } from '../hooks/useExpenseDrawer';
import { ExpenseTransactionDrawer } from './ExpenseTransactionDrawer';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { formatDate } from '@/shared/utils/date.utils';
import { getChartColor } from '@/shared/utils/chart.utils';
import type { CategorySummary } from '@/shared/types/expense.types';

interface ExpenseCategoryChartProps {
  /** Vehicle-Level Analytics: scope this chart to a single vehicle instead of the fleet. */
  licensePlate?: string;
}

function CategoryTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as CategorySummary;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-3 space-y-0.5 max-w-64">
      <p className="text-sm font-medium">{row.category}</p>
      <p className="text-xs text-muted-foreground">
        Total: <span className="font-medium text-foreground">{formatCurrency(row.total)}</span> ({row.percentageOfTotal}% of total)
      </p>
      <p className="text-xs text-muted-foreground">
        Transactions: <span className="font-medium text-foreground">{row.count}</span> &middot; Avg: <span className="font-medium text-foreground">{formatCurrency(row.average)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Range: <span className="font-medium text-foreground">{formatCurrency(row.min)} \u2013 {formatCurrency(row.max)}</span>
      </p>
      {row.topVehicle && (
        <p className="text-xs text-muted-foreground">
          Top vehicle: <span className="font-medium text-foreground">{row.topVehicle}</span>
        </p>
      )}
      {row.latestDate && (
        <p className="text-xs text-muted-foreground">
          Latest: <span className="font-medium text-foreground">{formatDate(row.latestDate)}</span>
        </p>
      )}
      {row.momChangePercent !== null && (
        <p className="text-xs text-muted-foreground">
          vs. prior period: <span className={`font-medium ${row.momChangePercent >= 0 ? 'text-danger' : 'text-success'}`}>
            {row.momChangePercent >= 0 ? '+' : ''}{row.momChangePercent}%
          </span>
        </p>
      )}
      <p className="pt-1 text-caption text-muted-foreground">Click to view transactions</p>
    </div>
  );
}

export function ExpenseCategoryChart({ licensePlate }: ExpenseCategoryChartProps = {}) {
  const { data: summary, isLoading, error } = useExpenseCategorySummary(undefined, licensePlate);
  const { data: expenseTypes } = useExpenseTypes();
  const { open, setOpen, filter, openDrawer } = useExpenseDrawer();

  const chartData = useMemo(() => {
    if (!summary) return [];
    return [...summary].sort((a, b) => b.total - a.total).slice(0, 8);
  }, [summary]);

  function handleClick(row: CategorySummary) {
    const type = expenseTypes?.find((t) => t.name === row.category);
    openDrawer({ label: row.category, type: type?._id, license_plate: licensePlate });
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Expense distribution</CardTitle></CardHeader>
        <CardContent><div className="rounded-lg h-55 skeleton" /></CardContent>
      </Card>
    );
  }

  if (error || chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Expense distribution</CardTitle>
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
            <CardTitle>Expense distribution</CardTitle>
            <CardDescription>By category &mdash; click a slice for transaction details</CardDescription>
          </div>
          <ChartExportButton
            filename={slugifyChartFilename('expense-distribution-by-category')}
            sheetName="Expense Distribution"
            headers={['Category', 'Total', 'Share (%)', 'Transactions', 'Average', 'Min', 'Max', 'Top Vehicle']}
            rows={chartData.map((r) => ({
              Category: r.category,
              Total: r.total,
              'Share (%)': r.percentageOfTotal,
              Transactions: r.count,
              Average: r.average,
              Min: r.min,
              Max: r.max,
              'Top Vehicle': r.topVehicle ?? '',
            }))}
          />
        </CardHeader>
        <CardContent>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="total"
                  nameKey="category"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  cursor="pointer"
                  onClick={(entry: any) => handleClick(entry)}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={entry.category} fill={getChartColor(index)} />
                  ))}
                </Pie>
                <Tooltip content={<CategoryTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      <ExpenseTransactionDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}