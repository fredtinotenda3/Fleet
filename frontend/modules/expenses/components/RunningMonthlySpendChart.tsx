// frontend/modules/expenses/components/RunningMonthlySpendChart.tsx

'use client';

import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useExpenseMonthlyTrends } from '../hooks/useExpenses';
import { formatCurrency } from '@/shared/utils/currency.utils';

interface RunningRow {
  month: string;
  total: number;
  running: number;
}

function RunningTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as RunningRow;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">
        This month: <span className="font-medium text-foreground">{formatCurrency(row.total)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Running total: <span className="font-medium text-foreground">{formatCurrency(row.running)}</span>
      </p>
    </div>
  );
}

export function RunningMonthlySpendChart() {
  const { data, isLoading, error } = useExpenseMonthlyTrends(12);

  const chartData = useMemo<RunningRow[]>(() => {
    if (!data) return [];
    let running = 0;
    return data.map((d) => {
      running += d.total;
      return { month: d.month, total: d.total, running };
    });
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Running monthly spend</CardTitle>
        <CardDescription>Cumulative expenses over the last 12 months</CardDescription>
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
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip content={<RunningTooltip />} />
                <Area type="monotone" dataKey="running" stroke="var(--chart-1)" strokeWidth={2} fill="url(#runningSpendFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}