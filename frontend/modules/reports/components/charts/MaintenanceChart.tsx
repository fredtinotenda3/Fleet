// frontend/modules/reports/components/charts/MaintenanceChart.tsx
'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useRouter } from 'next/navigation';
import { ChartContainer } from '@/frontend/shared/ui/charts';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import { MAINTENANCE_ROUTES } from '@/frontend/modules/maintenance/routes';

interface MaintenanceChartProps {
  data: { name: string; count: number }[] | undefined;
  isLoading: boolean;
}

export function MaintenanceChart({ data, isLoading }: MaintenanceChartProps) {
  const router = useRouter();

  function handleBarClick(entry: { name: string; count: number }) {
    router.push(`${MAINTENANCE_ROUTES.list}?status=${encodeURIComponent(entry.name.toLowerCase())}`);
  }
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
    <ChartContainer
      title="Maintenance by Status"
      actions={
        <ChartExportButton
          filename={slugifyChartFilename('maintenance-by-status')}
          sheetName="Maintenance by Status"
          headers={['Status', 'Records']}
          rows={data.map((r) => ({ Status: r.name, Records: r.count }))}
        />
      }
    >
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value: number, _name: string, item: any) => [`${value} records`, item.payload.name]} />
          <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(entry: any) => handleBarClick(entry)}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.name === 'Overdue' ? 'var(--destructive)' : 'var(--primary)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-caption text-muted-foreground">Click a bar to view those records</p>
    </ChartContainer>
  );
}