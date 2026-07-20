// frontend/modules/expenses/components/ExpenseAmountDistributionChart.tsx

'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useExpenseAmountDistribution } from '../hooks/useExpenses';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';

interface ExpenseAmountDistributionChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

interface BucketDatum {
  min: number;
  max: number;
  count: number;
  label: string;
  totalValue: number;
}

function DistributionTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as BucketDatum;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{row.label}</p>
      <p className="text-xs text-muted-foreground">
        Expenses: <span className="font-medium text-foreground">{row.count}</span>
      </p>
    </div>
  );
}

export function ExpenseAmountDistributionChart({ dateRange }: ExpenseAmountDistributionChartProps) {
  const { data, isLoading, error } = useExpenseAmountDistribution(dateRange);

  const chartData = useMemo<BucketDatum[]>(() => {
    return (data ?? []).map((bucket) => ({
      ...bucket,
      totalValue: bucket.count * ((bucket.min + bucket.max) / 2),
      label: `${formatCurrency(bucket.min)}\u2013${formatCurrency(bucket.max)}`,
    }));
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Expense amount distribution</CardTitle>
        <CardDescription>How many expenses fall in each cost range</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses in this range.</p>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={10} interval={0} angle={-30} textAnchor="end" height={60} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip content={<DistributionTooltip />} />
                <Bar dataKey="count" fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}