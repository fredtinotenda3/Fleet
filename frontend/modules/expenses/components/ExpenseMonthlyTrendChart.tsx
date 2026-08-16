
// frontend/modules/expenses/components/ExpenseMonthlyTrendChart.tsx

'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useExpenseMonthlyTrends } from '../hooks/useExpenses';
import { useExpenseDrawer } from '../hooks/useExpenseDrawer';
import { ExpenseTransactionDrawer } from './ExpenseTransactionDrawer';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import { formatCurrency } from '@/shared/utils/currency.utils';

interface ExpenseMonthlyTrendChartProps {
  /** Vehicle-Level Analytics: scope this chart to a single vehicle instead of the fleet. */
  licensePlate?: string;
}

/** "2026-07" -> "Jul 2026" */
function monthLabel(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** "2026-07" -> { startDate, endDate } (exclusive) */
function monthRange(month: string): { startDate?: Date; endDate?: Date } {
  if (!/^\d{4}-\d{2}$/.test(month)) return {};
  const [y, m] = month.split('-').map(Number);
  return { startDate: new Date(Date.UTC(y, m - 1, 1)), endDate: new Date(Date.UTC(y, m, 1)) };
}

function MonthlyTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as { month: string; total: number };
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{monthLabel(row.month)}</p>
      <p className="text-xs text-muted-foreground">
        Total: <span className="font-medium text-foreground">{formatCurrency(row.total)}</span>
      </p>
      <p className="pt-1 text-caption text-muted-foreground">Click to view transactions</p>
    </div>
  );
}

export function ExpenseMonthlyTrendChart({ licensePlate }: ExpenseMonthlyTrendChartProps = {}) {
  const { data: monthlyData, isLoading, error } = useExpenseMonthlyTrends(12, licensePlate);
  const { open, setOpen, filter, openDrawer } = useExpenseDrawer();

  function handleClick(row: { month: string; total: number }) {
    const { startDate, endDate } = monthRange(row.month);
    openDrawer({ label: `${monthLabel(row.month)} expenses`, license_plate: licensePlate, startDate, endDate });
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Monthly expense trend</CardTitle></CardHeader>
        <CardContent><div className="rounded-lg h-55 skeleton" /></CardContent>
      </Card>
    );
  }

  if (error || !monthlyData || monthlyData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monthly expense trend</CardTitle>
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
            <CardTitle>Monthly expense trend</CardTitle>
            <CardDescription>Last 12 months &mdash; click a point for details</CardDescription>
          </div>
          <ChartExportButton
            filename={slugifyChartFilename('monthly-expense-trend')}
            sheetName="Monthly Expense Trend"
            headers={['Month', 'Total']}
            rows={monthlyData.map((r) => ({ Month: monthLabel(r.month), Total: r.total }))}
          />
        </CardHeader>
        <CardContent>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={monthlyData} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tickFormatter={monthLabel} stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip content={<MonthlyTooltip />} />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={{ r: 3, cursor: 'pointer' }}
                  activeDot={{ r: 5, cursor: 'pointer', onClick: (_: any, e: any) => handleClick(e.payload) }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      <ExpenseTransactionDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}
