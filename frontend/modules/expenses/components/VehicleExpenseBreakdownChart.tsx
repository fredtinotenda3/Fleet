// frontend/modules/expenses/components/VehicleExpenseBreakdownChart.tsx

'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useVehicleExpenseBreakdown } from '../hooks/useExpenses';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { getChartColor } from '@/shared/utils/chart.utils';
import { EXPENSE_ROUTES } from '../routes';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';

interface VehicleExpenseBreakdownChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

function VehicleBreakdownTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const total = payload.reduce((sum: number, p: any) => sum + (p.value || 0), 0);
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-1">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">
        Total: <span className="font-medium text-foreground">{formatCurrency(total)}</span>
      </p>
      {payload
        .filter((p: any) => p.value > 0)
        .sort((a: any, b: any) => b.value - a.value)
        .map((p: any) => (
          <p key={p.dataKey} className="text-xs text-muted-foreground">
            {p.name}: <span className="font-medium text-foreground">{formatCurrency(p.value)}</span>
          </p>
        ))}
    </div>
  );
}

export function VehicleExpenseBreakdownChart({ dateRange }: VehicleExpenseBreakdownChartProps) {
  const router = useRouter();
  const { data, isLoading, error } = useVehicleExpenseBreakdown(dateRange, 8);

  const { chartData, categories } = useMemo(() => {
    if (!data || data.length === 0) return { chartData: [], categories: [] as string[] };
    const categorySet = new Set<string>();
    const byVehicle = new Map<string, Record<string, number>>();
    for (const row of data) {
      categorySet.add(row.category);
      if (!byVehicle.has(row.license_plate)) byVehicle.set(row.license_plate, {});
      byVehicle.get(row.license_plate)![row.category] = row.amount;
    }
    const cats = Array.from(categorySet);
    const rows = Array.from(byVehicle.entries())
      .map(([plate, values]) => ({
        license_plate: plate,
        ...values,
        __total: Object.values(values).reduce((s, v) => s + v, 0),
      }))
      .sort((a, b) => b.__total - a.__total);
    return { chartData: rows, categories: cats };
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vehicle expense breakdown</CardTitle>
        <CardDescription>Category spend, per vehicle -- click a bar for that vehicle&apos;s history</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-72 skeleton" />
        ) : error || chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expenses in this range.</p>
        ) : (
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="license_plate" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip content={<VehicleBreakdownTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {categories.map((cat, i) => (
                  <Bar
                    key={cat}
                    dataKey={cat}
                    stackId="vehicle-expenses"
                    fill={getChartColor(i)}
                    cursor="pointer"
                    onClick={(entry: any) => router.push(EXPENSE_ROUTES.vehicleHistory(entry.license_plate))}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}