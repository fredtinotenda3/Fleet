// frontend/modules/expenses/components/TopVehiclesByExpenseChart.tsx

'use client';

import { useRouter } from 'next/navigation';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useTopVehiclesByExpense } from '../hooks/useExpenses';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { getChartColor } from '@/shared/utils/chart.utils';
import { EXPENSE_ROUTES } from '../routes';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';
import type { TopVehicleExpenseRow } from '@/shared/types/expense.types';

interface TopVehiclesByExpenseChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

function TopVehiclesTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as TopVehicleExpenseRow;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{row.license_plate}</p>
      <p className="text-xs text-muted-foreground">
        Total spend: <span className="font-medium text-foreground">{formatCurrency(row.totalAmount)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Expenses: <span className="font-medium text-foreground">{row.expenseCount}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Top category: <span className="font-medium text-foreground">{row.topCategory}</span>
      </p>
    </div>
  );
}

export function TopVehiclesByExpenseChart({ dateRange }: TopVehiclesByExpenseChartProps) {
  const router = useRouter();
  const { data, isLoading, error } = useTopVehiclesByExpense(dateRange, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top vehicles by expense</CardTitle>
        <CardDescription>Highest-cost vehicles -- click a bar for its full expense history</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses in this range.</p>
        ) : (
          <div style={{ width: '100%', height: Math.max(260, data.length * 36) }}>
            <ResponsiveContainer>
              <BarChart data={data} layout="vertical" margin={{ left: 12, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                <YAxis type="category" dataKey="license_plate" stroke="var(--muted-foreground)" fontSize={11} width={90} />
                <Tooltip content={<TopVehiclesTooltip />} />
                <Bar
                  dataKey="totalAmount"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(entry: any) => router.push(EXPENSE_ROUTES.vehicleHistory(entry.license_plate))}
                >
                  {data.map((row, i) => (
                    <Cell key={row.license_plate} fill={getChartColor(i)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}