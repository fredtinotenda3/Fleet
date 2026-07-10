
// frontend/modules/expenses/components/ExpenseMonthlyTrendChart.tsx

'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useExpenseMonthlyTrends } from '../hooks/useExpenses';
import { formatCurrency } from '@/shared/utils/currency.utils';

export function ExpenseMonthlyTrendChart() {
  const { data: monthlyData, isLoading, error } = useExpenseMonthlyTrends(12);

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
    <Card>
      <CardHeader>
        <CardTitle>Monthly expense trend</CardTitle>
        <CardDescription>Last 12 months</CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={monthlyData} margin={{ left: -20, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                formatter={(value: number) => [formatCurrency(value), 'Total']}
              />
              <Line type="monotone" dataKey="total" stroke="var(--chart-1)" strokeWidth={2} dot={false} name="total" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}