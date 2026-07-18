// frontend/modules/fuel/components/FuelCostByDriverChart.tsx
// Enterprise analytics #2 -- reuses useFuelByDriver (sortBy='cost')
// rather than a separate query, matching FuelRepository.getFuelByDriver.

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useFuelByDriver } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';
import type { DriverFuelConsumptionRow } from '../types';

const BAR_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

interface FuelCostByDriverChartProps {
  dateRange: FuelAnalyticsDateRange;
}

function DriverCostTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as DriverFuelConsumptionRow;
  return (
    <div
      style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
      className="p-2.5 space-y-0.5"
    >
      <p className="text-sm font-medium">{row.driverName}</p>
      <p className="text-xs text-muted-foreground">
        Total cost: <span className="font-medium text-foreground">{formatCurrency(row.totalCost)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Total volume: <span className="font-medium text-foreground">{row.totalFuel.toFixed(1)} L</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Fuel entries: <span className="font-medium text-foreground">{row.logCount}</span>
      </p>
    </div>
  );
}

export function FuelCostByDriverChart({ dateRange }: FuelCostByDriverChartProps) {
  const { data, isLoading, error } = useFuelByDriver(dateRange, 10, 'cost');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fuel cost by driver</CardTitle>
        <CardDescription>Highest fuel spend, ranked by driver</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No driver-attributed fuel entries in this range.</p>
        ) : (
          <div style={{ width: '100%', height: Math.max(260, data.length * 36) }}>
            <ResponsiveContainer>
              <BarChart data={data} layout="vertical" margin={{ left: 12, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                <YAxis type="category" dataKey="driverName" stroke="var(--muted-foreground)" fontSize={11} width={120} />
                <Tooltip content={<DriverCostTooltip />} />
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