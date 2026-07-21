// frontend/modules/expenses/components/VehicleAverageCostChart.tsx

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useTopVehiclesByExpense } from '../hooks/useExpenses';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';
import type { TopVehicleExpenseRow } from '@/shared/types/expense.types';

interface VehicleAverageCostChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

function AverageCostTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as TopVehicleExpenseRow;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{row.license_plate}</p>
      <p className="text-xs text-muted-foreground">
        Average per expense: <span className="font-medium text-foreground">{formatCurrency(row.average)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Based on {row.expenseCount} expense{row.expenseCount === 1 ? '' : 's'}
      </p>
    </div>
  );
}

export function VehicleAverageCostChart({ dateRange }: VehicleAverageCostChartProps) {
  const { data, isLoading, error } = useTopVehiclesByExpense(dateRange, 10);
  const sorted = [...(data ?? [])].sort((a, b) => b.average - a.average);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Average expense per vehicle</CardTitle>
        <CardDescription>Typical cost per transaction, per vehicle -- flags vehicles with high per-visit cost</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses in this range.</p>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={sorted} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="license_plate" stroke="var(--muted-foreground)" fontSize={11} interval={0} angle={-35} textAnchor="end" height={60} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip content={<AverageCostTooltip />} />
                <Bar dataKey="average" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}