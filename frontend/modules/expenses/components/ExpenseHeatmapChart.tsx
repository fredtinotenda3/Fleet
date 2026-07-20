// frontend/modules/expenses/components/ExpenseHeatmapChart.tsx

'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useExpenseCategoryOverTime } from '../hooks/useExpenses';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';

interface ExpenseHeatmapChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

export function ExpenseHeatmapChart({ dateRange }: ExpenseHeatmapChartProps) {
  const { data, isLoading, error } = useExpenseCategoryOverTime(dateRange);

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Expense heatmap</CardTitle>
        <CardDescription>Spending intensity by category and month</CardDescription>
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
                        className="h-8 border rounded-sm border-border/40"
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
  );
}