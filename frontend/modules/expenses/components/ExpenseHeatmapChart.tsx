// frontend/modules/expenses/components/ExpenseHeatmapChart.tsx

'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useExpenseCategoryOverTime, useExpenseTypes } from '../hooks/useExpenses';
import { useExpenseDrawer } from '../hooks/useExpenseDrawer';
import { ExpenseTransactionDrawer } from './ExpenseTransactionDrawer';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';

interface ExpenseHeatmapChartProps {
  dateRange: ExpenseAnalyticsDateRange;
  /** Vehicle-Level Analytics: scope this chart to a single vehicle instead of the fleet. */
  licensePlate?: string;
}

export function ExpenseHeatmapChart({ dateRange, licensePlate }: ExpenseHeatmapChartProps) {
  const { data, isLoading, error } = useExpenseCategoryOverTime(dateRange, licensePlate);
  const { data: expenseTypes } = useExpenseTypes();
  const { open, setOpen, filter, openDrawer } = useExpenseDrawer();

  const { months, categories, cellMap, max } = useMemo(() => {
    const monthSet = new Set<string>();
    const categorySet = new Set<string>();
    const cells = new Map<string, { amount: number; count: number }>();
    let maxAmount = 0;

    for (const point of data ?? []) {
      monthSet.add(point.month);
      categorySet.add(point.category);
      cells.set(`${point.category}__${point.month}`, { amount: point.amount, count: point.count });
      if (point.amount > maxAmount) maxAmount = point.amount;
    }

    return {
      months: Array.from(monthSet).sort(),
      categories: Array.from(categorySet),
      cellMap: cells,
      max: maxAmount,
    };
  }, [data]);

  function intensity(amount: number): string {
    if (max === 0 || amount === 0) return 'transparent';
    const ratio = amount / max;
    return `color-mix(in srgb, var(--chart-2) ${Math.round(ratio * 90) + 10}%, transparent)`;
  }

  function handleCellClick(category: string, month: string) {
    const cell = cellMap.get(`${category}__${month}`);
    if (!cell || cell.count === 0) return;
    const type = expenseTypes?.find((t) => t.name === category);
    const [y, m] = month.split('-').map(Number);
    const startDate = Number.isFinite(y) && Number.isFinite(m) ? new Date(Date.UTC(y, m - 1, 1)) : undefined;
    const endDate = Number.isFinite(y) && Number.isFinite(m) ? new Date(Date.UTC(y, m, 1)) : undefined;
    openDrawer({ label: `${category} \u2014 ${month}`, type: type?._id, startDate, endDate, license_plate: licensePlate });
  }

  const exportRows = useMemo(() => {
    const rows: Record<string, string | number>[] = [];
    for (const cat of categories) {
      for (const m of months) {
        const cell = cellMap.get(`${cat}__${m}`);
        if (cell) rows.push({ Category: cat, Month: m, Amount: cell.amount, Expenses: cell.count });
      }
    }
    return rows;
  }, [categories, months, cellMap]);

  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Expense heatmap</CardTitle>
          <CardDescription>Spending intensity by category and month &mdash; click a cell for transactions</CardDescription>
        </div>
        {exportRows.length > 0 && (
          <ChartExportButton
            filename={slugifyChartFilename('expense-heatmap')}
            sheetName="Expense Heatmap"
            headers={['Category', 'Month', 'Amount', 'Expenses']}
            rows={exportRows}
          />
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || categories.length === 0 || months.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `110px repeat(${months.length}, 56px)` }}>
              <div />
              {months.map((m) => (
                <div key={m} className="text-[10px] text-center text-muted-foreground">{m}</div>
              ))}
              {categories.map((cat) => (
                <div key={cat} className="contents">
                  <div className="flex items-center pr-2 text-xs truncate text-muted-foreground" title={cat}>{cat}</div>
                  {months.map((m) => {
                    const cell = cellMap.get(`${cat}__${m}`);
                    return (
                      <div
                        key={m}
                        title={cell ? `${cat} \u2014 ${m}: ${formatCurrency(cell.amount)} (${cell.count} expenses)` : `${cat} \u2014 ${m}: no expenses`}
                        onClick={() => handleCellClick(cat, m)}
                        className={`h-8 border rounded-sm border-border/40 ${cell && cell.count > 0 ? 'cursor-pointer' : ''}`}
                        style={{ backgroundColor: intensity(cell?.amount ?? 0) }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    <ExpenseTransactionDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}