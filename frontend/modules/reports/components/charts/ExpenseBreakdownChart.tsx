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
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { getChartColor } from '@/shared/utils/chart.utils';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import { EXPENSE_ROUTES } from '@/frontend/modules/expenses/routes';

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
  const router = useRouter();

  function handleSliceClick(entry: ExpenseCategoryItem) {
    router.push(`${EXPENSE_ROUTES.list}?category=${encodeURIComponent(entry.name)}`);
  }
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
    <ChartContainer
      title={`Expense Breakdown (Total: ${formatCurrency(total)})`}
      actions={
        <ChartExportButton
          filename={slugifyChartFilename('expense-breakdown')}
          sheetName="Expense Breakdown"
          headers={['Category', 'Amount', 'Share (%)']}
          rows={data.map((r) => ({ Category: r.name, Amount: r.value, 'Share (%)': r.percentage }))}
        />
      }
    >
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
            cursor="pointer"
            onClick={(entry: any) => handleSliceClick(entry)}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={getChartColor(index)} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, _name: string, item: any) => [
              `${formatCurrency(value)} (${item.payload.percentage}%)`,
              item.payload.name,
            ]}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
      <p className="mt-2 text-caption text-muted-foreground">Click a slice to view expenses in that category</p>
    </ChartContainer>
  );
}