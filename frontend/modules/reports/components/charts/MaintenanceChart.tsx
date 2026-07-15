// frontend/modules/reports/components/charts/MaintenanceChart.tsx
'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ChartContainer } from '@/frontend/shared/ui/charts';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';

interface MaintenanceChartProps {
  data: { name: string; count: number }[] | undefined;
  isLoading: boolean;
}

export function MaintenanceChart({ data, isLoading }: MaintenanceChartProps) {
  if (isLoading) {
    return (
      <ChartContainer title="Maintenance Overview">
        <Skeleton className="h-64 w-full" />
      </ChartContainer>
    );
  }

  if (!data || data.length === 0) {
    return (
      <ChartContainer title="Maintenance Overview">
        <p className="text-sm text-muted-foreground">No maintenance data.</p>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer title="Maintenance by Status">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.name === 'Overdue' ? 'var(--destructive)' : 'var(--primary)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}