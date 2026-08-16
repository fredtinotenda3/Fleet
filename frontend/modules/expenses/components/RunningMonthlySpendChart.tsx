// frontend/modules/expenses/components/RunningMonthlySpendChart.tsx

'use client';

import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useExpenseMonthlyTrends } from '../hooks/useExpenses';
import { useExpenseDrawer } from '../hooks/useExpenseDrawer';
import { ExpenseTransactionDrawer } from './ExpenseTransactionDrawer';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import { formatCurrency } from '@/shared/utils/currency.utils';

interface RunningMonthlySpendChartProps {
  /** Vehicle-Level Analytics: scope this chart to a single vehicle instead of the fleet. */
  licensePlate?: string;
}

interface RunningRow {
  month: string;
  total: number;
  running: number;
}

/** "2026-07" -> "Jul 2026" */
function monthLabel(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function monthRange(month: string): { startDate?: Date; endDate?: Date } {
  if (!/^\d{4}-\d{2}$/.test(month)) return {};
  const [y, m] = month.split('-').map(Number);
  return { startDate: new Date(Date.UTC(y, m - 1, 1)), endDate: new Date(Date.UTC(y, m, 1)) };
}

function RunningTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as RunningRow;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{monthLabel(label)}</p>
      <p className="text-xs text-muted-foreground">
        This month: <span className="font-medium text-foreground">{formatCurrency(row.total)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Running total: <span className="font-medium text-foreground">{formatCurrency(row.running)}</span>
      </p>
      <p className="pt-1 text-caption text-muted-foreground">Click to view this month's transactions</p>
    </div>
  );
}

export function RunningMonthlySpendChart({ licensePlate }: RunningMonthlySpendChartProps = {}) {
  const { data, isLoading, error } = useExpenseMonthlyTrends(12, licensePlate);
  const { open, setOpen, filter, openDrawer } = useExpenseDrawer();

  const chartData = useMemo<RunningRow[]>(() => {
    if (!data) return [];
    let running = 0;
    return data.map((d) => {
      running += d.total;
      return { month: d.month, total: d.total, running };
    });
  }, [data]);

  function handleClick(row: RunningRow) {
    const { startDate, endDate } = monthRange(row.month);
    openDrawer({ label: `${monthLabel(row.month)} expenses`, license_plate: licensePlate, startDate, endDate });
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Running monthly spend</CardTitle>
            <CardDescription>Cumulative expenses over the last 12 months &mdash; click a point for that month's transactions</CardDescription>
          </div>
          {chartData.length > 0 && (
            <ChartExportButton
              filename={slugifyChartFilename('running-monthly-spend')}
              sheetName="Running Monthly Spend"
              headers={['Month', 'Total', 'Running Total']}
              rows={chartData.map((r) => ({ Month: monthLabel(r.month), Total: r.total, 'Running Total': r.running }))}
            />
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg h-60 skeleton" />
          ) : error || chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses in this range.</p>
          ) : (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <AreaChart data={chartData} margin={{ left: -20, right: 8 }}>
                  <defs>
                    <linearGradient id="runningSpendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tickFormatter={monthLabel} stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip content={<RunningTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="running"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    fill="url(#runningSpendFill)"
                    dot={{ r: 3, cursor: 'pointer' }}
                    activeDot={{ r: 5, cursor: 'pointer', onClick: (_: any, e: any) => handleClick(e.payload) }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      <ExpenseTransactionDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}
