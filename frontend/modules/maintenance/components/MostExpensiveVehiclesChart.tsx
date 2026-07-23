//frontend/modules/maintenance/components/MostExpensiveVehiclesChart.tsx


'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useMostExpensiveVehicles } from '../hooks/useMaintenance';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { MostExpensiveVehicleRow } from '../types';

const BAR_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

function ExpensiveTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as MostExpensiveVehicleRow;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{row.license_plate}</p>
      <p className="text-xs text-muted-foreground">Total cost: <span className="font-medium text-foreground">{formatCurrency(row.totalCost)}</span></p>
      <p className="text-xs text-muted-foreground">Records: <span className="font-medium text-foreground">{row.recordCount}</span></p>
    </div>
  );
}

export function MostExpensiveVehiclesChart() {
  const { data, isLoading, error } = useMostExpensiveVehicles(10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Most expensive vehicles</CardTitle>
        <CardDescription>Highest cumulative maintenance cost</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No completed maintenance records yet.</p>
        ) : (
          <div style={{ width: '100%', height: Math.max(260, data.length * 36) }}>
            <ResponsiveContainer>
              <BarChart data={data} layout="vertical" margin={{ left: 12, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                <YAxis type="category" dataKey="license_plate" stroke="var(--muted-foreground)" fontSize={11} width={100} />
                <Tooltip content={<ExpensiveTooltip />} />
                <Bar dataKey="totalCost" radius={[0, 4, 4, 0]}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
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