// frontend/modules/fuel/components/FuelByStationChart.tsx
// Enterprise analytics #4 (Fuel Spend by Station) + #8 (Top Fuel Stations),
// backed by the single shared useFuelByStation query -- sorted by the
// selected metric client-side rather than issuing two separate queries.

'use client';

import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { useFuelByStation } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';

type SortMode = 'spend' | 'visits';

const BAR_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

interface FuelByStationChartProps {
  dateRange: FuelAnalyticsDateRange;
}

export function FuelByStationChart({ dateRange }: FuelByStationChartProps) {
  const [sortMode, setSortMode] = useState<SortMode>('spend');
  const { data, isLoading, error } = useFuelByStation(dateRange, 15);

  const sorted = useMemo(() => {
    if (!data) return [];
    const rows = [...data];
    rows.sort((a, b) => (sortMode === 'spend' ? b.totalSpend - a.totalSpend : b.visits - a.visits));
    return rows.slice(0, 10);
  }, [data, sortMode]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>{sortMode === 'spend' ? 'Fuel spend by station' : 'Top fuel stations'}</CardTitle>
          <CardDescription>
            {sortMode === 'spend' ? 'Highest total spend, per station' : 'Most frequently used stations'}
          </CardDescription>
        </div>
        <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="spend">By spend</SelectItem>
            <SelectItem value="visits">By visits</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No station data in this range.</p>
        ) : (
          <div style={{ width: '100%', height: Math.max(260, sorted.length * 36) }}>
            <ResponsiveContainer>
              <BarChart data={sorted} layout="vertical" margin={{ left: 12, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  tickFormatter={(v) => (sortMode === 'spend' ? formatCurrency(v) : String(v))}
                />
                <YAxis type="category" dataKey="stationName" stroke="var(--muted-foreground)" fontSize={11} width={130} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                  formatter={(value: number, name: string) => {
                    if (name === 'totalSpend') return [formatCurrency(value), 'Total spend'];
                    if (name === 'totalLitres') return [`${value.toFixed(1)} L`, 'Total litres'];
                    return [value, 'Visits'];
                  }}
                />
                <Bar dataKey={sortMode === 'spend' ? 'totalSpend' : 'visits'} radius={[0, 4, 4, 0]}>
                  {sorted.map((_, i) => (
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