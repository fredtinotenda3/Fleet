// frontend/modules/reports/components/charts/FuelTrendChart.tsx
'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { ChartContainer } from '@/frontend/shared/ui/charts';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/shared/utils/currency.utils';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import { FUEL_ROUTES } from '@/frontend/modules/fuel/routes';

interface FuelTrendPoint {
  month: string;
  volume: number;
  cost: number;
}

interface FuelTrendChartProps {
  data: FuelTrendPoint[] | undefined;
  isLoading: boolean;
  totalVolume: number;
  totalCost: number;
}

export function FuelTrendChart({ data, isLoading, totalVolume, totalCost }: FuelTrendChartProps) {
  const router = useRouter();

  function handlePointClick(row: FuelTrendPoint) {
    router.push(`${FUEL_ROUTES.analytics}?month=${encodeURIComponent(row.month)}`);
  }
  if (isLoading) {
    return (
      <ChartContainer title="Fuel Consumption & Cost">
        <Skeleton className="h-64 w-full" />
      </ChartContainer>
    );
  }

  if (!data || data.length === 0) {
    return (
      <ChartContainer title="Fuel Consumption & Cost">
        <p className="text-sm text-muted-foreground">No fuel data available.</p>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer
      title={`Fuel Trend (${totalVolume.toFixed(1)} L, ${formatCurrency(totalCost)})`}
      actions={
        <ChartExportButton
          filename={slugifyChartFilename('fuel-trend')}
          sheetName="Fuel Trend"
          headers={['Month', 'Volume (L)', 'Cost']}
          rows={data.map((r) => ({ Month: r.month, 'Volume (L)': r.volume, Cost: r.cost }))}
        />
      }
    >
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value: number, name: string) =>
              name === 'cost' ? formatCurrency(value) : `${value.toFixed(1)} L`
            }
          />
          <Legend />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="volume"
            stroke="var(--primary)"
            name="Volume (L)"
            strokeWidth={2}
            dot={{ r: 3, cursor: 'pointer' }}
            activeDot={{ r: 5, cursor: 'pointer', onClick: (_: any, e: any) => handlePointClick(e.payload) }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="cost"
            stroke="var(--chart-2)"
            name="Cost"
            strokeWidth={2}
            dot={{ r: 3, cursor: 'pointer' }}
            activeDot={{ r: 5, cursor: 'pointer', onClick: (_: any, e: any) => handlePointClick(e.payload) }}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-2 text-caption text-muted-foreground">Click a point to open that month in Fuel Analytics</p>
    </ChartContainer>
  );
}