// modules/expenses/components/ExpenseCharts.tsx

'use client';

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CHART_COLORS } from '@/shared/utils/chart.utils';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';

interface ExpenseChartsProps {
  monthlyTrends: Array<{ month: string; total: number }> | undefined;
  topCategories: Array<{ name: string; amount: number }> | undefined;
  byType: Record<string, number> | undefined;
  isLoading: boolean;
}

export function ExpenseCharts({ monthlyTrends, topCategories, byType, isLoading }: ExpenseChartsProps) {
  if (isLoading) {
    return <LoadingState type="card" count={2} />;
  }

  const pieData = topCategories?.map(cat => ({
    name: cat.name,
    value: cat.amount,
  })) || [];

  const barData = monthlyTrends || [];

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Monthly Trends Line Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Expense Trends</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => formatCurrency(value)} />
                <Tooltip formatter={(value) => formatCurrency(value as number)} />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke={CHART_COLORS.primary}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No trend data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category Distribution Pie Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Expense Distribution by Category</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) =>
                    `${name}: ${(percent * 100).toFixed(0)}%`
                  }
                >
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS.palette[index % CHART_COLORS.palette.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value as number)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              No category data available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}