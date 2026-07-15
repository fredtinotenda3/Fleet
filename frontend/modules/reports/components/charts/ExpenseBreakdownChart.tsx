// frontend/modules/reports/components/charts/ExpenseBreakdownChart.tsx
'use client';

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import { ChartContainer } from '@/frontend/shared/ui/charts';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { getChartColor } from '@/shared/utils/chart.utils';

interface ExpenseCategoryItem {
  name: string;
  value: number;
  percentage: number;
}

interface ExpenseBreakdownChartProps {
  data: ExpenseCategoryItem[] | undefined;
  isLoading: boolean;
  total: number;
}

export function ExpenseBreakdownChart({ data, isLoading, total }: ExpenseBreakdownChartProps) {
  if (isLoading) {
    return (
      <ChartContainer title="Expense Breakdown">
        <Skeleton className="h-64 w-full" />
      </ChartContainer>
    );
  }

  if (!data || data.length === 0) {
    return (
      <ChartContainer title="Expense Breakdown">
        <p className="text-sm text-muted-foreground">No expense data available.</p>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer title={`Expense Breakdown (Total: ${formatCurrency(total)})`}>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={100}
            innerRadius={60}
            paddingAngle={2}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={getChartColor(index)} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}