// frontend/modules/expenses/components/TopVehiclesByExpenseChart.tsx

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useTopVehiclesByExpense } from '../hooks/useExpenses';
import { useExpenseDrawer } from '../hooks/useExpenseDrawer';
import { ExpenseTransactionDrawer } from './ExpenseTransactionDrawer';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { formatDate } from '@/shared/utils/date.utils';
import { getChartColor } from '@/shared/utils/chart.utils';
import type { ExpenseAnalyticsDateRange } from './ExpenseAnalyticsFilterBar';
import type { TopVehicleExpenseRow } from '@/shared/types/expense.types';

interface TopVehiclesByExpenseChartProps {
  dateRange: ExpenseAnalyticsDateRange;
}

function TopVehiclesTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as TopVehicleExpenseRow;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-3 space-y-0.5 max-w-64">
      <p className="text-sm font-medium">{row.license_plate}</p>
      <p className="text-xs text-muted-foreground">
        Total: <span className="font-medium text-foreground">{formatCurrency(row.totalAmount)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        {row.expenseCount} expenses &middot; avg {formatCurrency(row.average)}
      </p>
      <p className="text-xs text-muted-foreground">
        Range: {formatCurrency(row.min)} \u2013 {formatCurrency(row.max)}
      </p>
      <p className="text-xs text-muted-foreground">Top category: {row.topCategory}</p>
      {row.latestDate && <p className="text-xs text-muted-foreground">Latest: {formatDate(row.latestDate)}</p>}
      {row.momChangePercent !== null && (
        <p className="text-xs text-muted-foreground">
          vs. prior period: <span className={row.momChangePercent >= 0 ? 'text-danger' : 'text-success'}>
            {row.momChangePercent >= 0 ? '+' : ''}{row.momChangePercent}%
          </span>
        </p>
      )}
      <p className="pt-1 text-caption text-muted-foreground">Click to view transactions</p>
    </div>
  );
}

export function TopVehiclesByExpenseChart({ dateRange }: TopVehiclesByExpenseChartProps) {
  const { data, isLoading, error } = useTopVehiclesByExpense(dateRange, 10);
  const { open, setOpen, filter, openDrawer } = useExpenseDrawer();

  function handleClick(row: TopVehicleExpenseRow) {
    openDrawer({
      label: row.license_plate,
      license_plate: row.license_plate,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Top vehicles by expense</CardTitle>
          <CardDescription>Highest-cost vehicles &mdash; click a bar for transactions</CardDescription>
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
                  <Bar dataKey="totalAmount" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(entry: any) => handleClick(entry)}>
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
      <ExpenseTransactionDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}