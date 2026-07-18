// frontend/modules/fuel/components/FuelFrequencyByVehicleChart.tsx
// Enterprise analytics #7

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useFuelingFrequencyByVehicle } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';
import type { FuelFrequencyByVehicleRow } from '../types';

interface FuelFrequencyByVehicleChartProps {
  dateRange: FuelAnalyticsDateRange;
}

function FrequencyTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as FuelFrequencyByVehicleRow;
  return (
    <div
      style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
      className="p-2.5 space-y-0.5"
    >
      <p className="text-sm font-medium">{row.license_plate}</p>
      <p className="text-xs text-muted-foreground">
        Fuel events: <span className="font-medium text-foreground">{row.count}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Total volume: <span className="font-medium text-foreground">{row.totalVolume.toFixed(1)} L</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Total cost: <span className="font-medium text-foreground">{formatCurrency(row.totalCost)}</span>
      </p>
    </div>
  );
}

export function FuelFrequencyByVehicleChart({ dateRange }: FuelFrequencyByVehicleChartProps) {
  const { data, isLoading, error } = useFuelingFrequencyByVehicle(dateRange, 20);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fueling frequency by vehicle</CardTitle>
        <CardDescription>Number of fuel events per vehicle -- useful for spotting abnormal fueling behaviour</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fuel entries in this range.</p>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={data} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="license_plate" stroke="var(--muted-foreground)" fontSize={11} interval={0} angle={-35} textAnchor="end" height={60} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip content={<FrequencyTooltip />} />
                <Bar dataKey="count" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}