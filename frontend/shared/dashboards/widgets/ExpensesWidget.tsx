// frontend/shared/dashboards/widgets/ExpensesWidget.tsx

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Wallet } from 'lucide-react';
import { DashboardWidget } from '@/frontend/shared/dashboards/DashboardWidget';
import { useExpenseBreakdownWidget } from '@/frontend/modules/dashboard/hooks/useDashboardData';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { getChartColor } from '@/shared/utils/chart.utils';

export function ExpensesWidget() {
  const { data, isLoading, isError, refetch } = useExpenseBreakdownWidget();
  const categories = data?.categories ?? [];

  return (
    <DashboardWidget
      title="Expense breakdown"
      icon={<Wallet className="w-4 h-4" />}
      isLoading={isLoading}
      isError={isError}
      onRefresh={() => refetch()}
    >
      {categories.length === 0 ? (
        <p className="py-8 text-center text-body-sm text-muted-foreground">No expenses recorded yet.</p>
      ) : (
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={categories} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} width={90} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                formatter={(value: number) => [formatCurrency(value), 'Amount']}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {categories.map((entry, index) => (
                  <Cell key={entry.name} fill={getChartColor(index)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </DashboardWidget>
  );
}
