// frontend/modules/expenses/components/JobTripExpenseChart.tsx

'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useJobTripExpense, useExpenseTypes } from '../hooks/useExpenses';
import { useExpenseDrawer } from '../hooks/useExpenseDrawer';
import { ExpenseTransactionDrawer } from './ExpenseTransactionDrawer';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { getChartColor } from '@/shared/utils/chart.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';

interface JobTripExpenseChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

function JobTripTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const total = payload.reduce((sum: number, p: any) => sum + (p.value || 0), 0);
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-1">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">
        Total: <span className="font-medium text-foreground">{formatCurrency(total)}</span>
      </p>
      {payload
        .filter((p: any) => p.value > 0)
        .sort((a: any, b: any) => b.value - a.value)
        .map((p: any) => (
          <p key={p.dataKey} className="text-xs text-muted-foreground">
            {p.name}: <span className="font-medium text-foreground">{formatCurrency(p.value)}</span>
          </p>
        ))}
    </div>
  );
}

export function JobTripExpenseChart({ dateRange }: JobTripExpenseChartProps) {
  const { data, isLoading, error } = useJobTripExpense(dateRange, 10);
  const { data: expenseTypes } = useExpenseTypes();
  const { open, setOpen, filter, openDrawer } = useExpenseDrawer();

  const { chartData, categories } = useMemo(() => {
    if (!data || data.length === 0) return { chartData: [], categories: [] as string[] };
    const categorySet = new Set<string>();
    const byJob = new Map<string, Record<string, number>>();
    for (const row of data) {
      categorySet.add(row.category);
      if (!byJob.has(row.jobTrip)) byJob.set(row.jobTrip, {});
      byJob.get(row.jobTrip)![row.category] = row.amount;
    }
    const cats = Array.from(categorySet);
    const rows = Array.from(byJob.entries()).map(([jobTrip, values]) => ({ jobTrip, ...values }));
    return { chartData: rows, categories: cats };
  }, [data]);

  function handleClick(jobTrip: string, category: string) {
    const type = expenseTypes?.find((t) => t.name === category);
    openDrawer({
      label: `${jobTrip} \u2014 ${category}`,
      jobTrip,
      type: type?._id,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    } as any);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Job / Trip expense analysis</CardTitle>
          <CardDescription>Category spend, per job or trip reference &mdash; click a segment for transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg h-72 skeleton" />
          ) : error || chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No job/trip-tagged expenses in this range.</p>
          ) : (
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} layout="vertical" margin={{ left: 12, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                  <YAxis type="category" dataKey="jobTrip" stroke="var(--muted-foreground)" fontSize={11} width={110} />
                  <Tooltip content={<JobTripTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {categories.map((cat, i) => (
                    <Bar
                      key={cat}
                      dataKey={cat}
                      stackId="job-trip"
                      fill={getChartColor(i)}
                      cursor="pointer"
                      onClick={(entry: any) => handleClick(entry.jobTrip, cat)}
                    />
                  ))}
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