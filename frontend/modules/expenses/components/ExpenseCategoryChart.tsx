
// frontend/modules/expenses/components/ExpenseCategoryChart.tsx

'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useExpenseStats } from '../hooks/useExpenses';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { getChartColor } from '@/shared/utils/chart.utils';

export function ExpenseCategoryChart() {
  const { data: stats, isLoading, error } = useExpenseStats();

  const chartData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.byType)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [stats]);

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
    <Card>
      <CardHeader>
        <CardTitle>Expense distribution</CardTitle>
        <CardDescription>By category</CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                {chartData.map((entry, index) => (
                  <Cell key={entry.name} fill={getChartColor(index)} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                formatter={(value: number) => [formatCurrency(value), 'Amount']}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}