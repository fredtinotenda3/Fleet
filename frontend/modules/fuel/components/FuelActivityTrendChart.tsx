// frontend/modules/fuel/components/FuelActivityTrendChart.tsx
// Enterprise analytics #3

'use client';

import { useState } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { useFuelActivityTrend } from '../hooks/useFuel';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';
import type { FuelTrendGranularity } from '../types';

type LineMetric = 'volume' | 'cost' | 'avgCostPerLitre';

const GRANULARITY_LABELS: Record<FuelTrendGranularity, string> = {
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
};

const METRIC_LABELS: Record<LineMetric, string> = {
  volume: 'Fuel volume (L)',
  cost: 'Total cost',
  avgCostPerLitre: 'Average cost / L',
};

interface FuelActivityTrendChartProps {
  dateRange: FuelAnalyticsDateRange;
}

export function FuelActivityTrendChart({ dateRange }: FuelActivityTrendChartProps) {
  const [granularity, setGranularity] = useState<FuelTrendGranularity>('month');
  const [metric, setMetric] = useState<LineMetric>('volume');
  const { data, isLoading, error } = useFuelActivityTrend(granularity, dateRange);

  const formatMetric = (value: number) => (metric === 'volume' ? `${value.toFixed(1)} L` : formatCurrency(value));

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Fuel activity trend</CardTitle>
          <CardDescription>Entries vs. {METRIC_LABELS[metric].toLowerCase()}, by {GRANULARITY_LABELS[granularity].toLowerCase()}</CardDescription>
        </div>
        <div className="flex gap-2">
          <Select value={granularity} onValueChange={(v) => setGranularity(v as FuelTrendGranularity)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(GRANULARITY_LABELS) as FuelTrendGranularity[]).map((g) => (
                <SelectItem key={g} value={g}>{GRANULARITY_LABELS[g]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={metric} onValueChange={(v) => setMetric(v as LineMetric)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(METRIC_LABELS) as LineMetric[]).map((m) => (
                <SelectItem key={m} value={m}>{METRIC_LABELS[m]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fuel entries in this range.</p>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="period" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis yAxisId="entries" stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <YAxis yAxisId="metric" orientation="right" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={formatMetric} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                  formatter={(value: number, name: string) =>
                    name === 'entries' ? [value, 'Entries'] : [formatMetric(value), METRIC_LABELS[metric]]
                  }
                />
                <Bar yAxisId="entries" dataKey="entries" fill="var(--chart-2)" radius={[4, 4, 0, 0]} name="entries" />
                <Line yAxisId="metric" type="monotone" dataKey={metric} stroke="var(--chart-1)" strokeWidth={2} dot={false} name={metric} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}