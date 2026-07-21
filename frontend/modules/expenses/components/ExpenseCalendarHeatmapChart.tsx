// frontend/modules/expenses/components/ExpenseCalendarHeatmapChart.tsx

'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useDailyExpenseTotals } from '../hooks/useExpenses';
import { useExpenseDrawer } from '../hooks/useExpenseDrawer';
import { ExpenseTransactionDrawer } from './ExpenseTransactionDrawer';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';

interface ExpenseCalendarHeatmapChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ExpenseCalendarHeatmapChart({ dateRange }: ExpenseCalendarHeatmapChartProps) {
  const { data, isLoading, error } = useDailyExpenseTotals(dateRange);
  const { open, setOpen, filter, openDrawer } = useExpenseDrawer();

  const { weeks, max, rangeStart, rangeEnd } = useMemo(() => {
    if (!data || data.length === 0) {
      return { weeks: [] as { date: string; amount: number; count: number }[][], max: 0, rangeStart: null as Date | null, rangeEnd: null as Date | null };
    }

    const byDate = new Map(data.map((d) => [d.date, d]));
    const sortedDates = data.map((d) => new Date(d.date)).sort((a, b) => a.getTime() - b.getTime());
    const start = new Date(sortedDates[0]);
    const end = new Date(sortedDates[sortedDates.length - 1]);

    // Align the grid to start on a Sunday for a clean weekly-column layout.
    const gridStart = new Date(start);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());

    const days: { date: string; amount: number; count: number }[] = [];
    const cursor = new Date(gridStart);
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      const entry = byDate.get(key);
      days.push({ date: key, amount: entry?.amount ?? 0, count: entry?.count ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    const weekChunks: { date: string; amount: number; count: number }[][] = [];
    for (let i = 0; i < days.length; i += 7) weekChunks.push(days.slice(i, i + 7));

    const maxAmount = Math.max(...data.map((d) => d.amount), 0);
    return { weeks: weekChunks, max: maxAmount, rangeStart: start, rangeEnd: end };
  }, [data]);

  function intensity(amount: number): string {
    if (max === 0 || amount === 0) return 'transparent';
    const ratio = amount / max;
    return `color-mix(in srgb, var(--chart-1) ${Math.round(ratio * 90) + 10}%, transparent)`;
  }

  function handleDayClick(day: { date: string; amount: number; count: number }) {
    if (day.count === 0) return;
    const start = new Date(day.date);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
    openDrawer({ label: day.date, startDate: start, endDate: end });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Expense calendar heatmap</CardTitle>
          <CardDescription>
            {rangeStart && rangeEnd
              ? `Daily spending intensity, ${rangeStart.toLocaleDateString()} \u2013 ${rangeEnd.toLocaleDateString()}`
              : 'Daily spending intensity'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg h-40 skeleton" />
          ) : error || weeks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses in this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="inline-flex gap-0.5">
                <div className="flex flex-col justify-around pr-1 text-[9px] text-muted-foreground">
                  {WEEKDAY_LABELS.map((d) => <div key={d} className="h-3.5">{d}</div>)}
                </div>
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-0.5">
                    {week.map((day) => (
                      <div
                        key={day.date}
                        title={`${day.date}: ${day.count > 0 ? `${formatCurrency(day.amount)} across ${day.count} expense${day.count === 1 ? '' : 's'}` : 'no expenses'}`}
                        onClick={() => handleDayClick(day)}
                        className={`h-3.5 w-3.5 rounded-sm border border-border/40 ${day.count > 0 ? 'cursor-pointer' : ''}`}
                        style={{ backgroundColor: intensity(day.amount) }}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Darker cells indicate higher daily spend. Click a day with activity for its transactions.</p>
            </div>
          )}
        </CardContent>
      </Card>
      <ExpenseTransactionDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}