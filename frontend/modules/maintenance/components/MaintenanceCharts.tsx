// frontend/modules/maintenance/components/MaintenanceCharts.tsx

'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { useMaintenanceStats, useAllMaintenanceRecords } from '../hooks/useMaintenance';
import { useMaintenanceDrawer } from '../hooks/useMaintenanceDrawer';
import { MaintenanceRecordDrawer } from './MaintenanceRecordDrawer';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import { MAINTENANCE_CATEGORY_LABELS, type MaintenanceCategory } from '../types';

const STATUS_COLORS: Record<string, string> = {
  Pending: '#3b82f6',
  Completed: '#22c55e',
  Overdue: '#ef4444',
  Cancelled: '#94a3b8',
};

/** Display label -> the lowercase status value the maintenance list API filters on. */
const STATUS_FILTER_VALUES: Record<string, string> = {
  Pending: 'pending',
  Overdue: 'overdue',
  Completed: 'completed',
  Cancelled: 'cancelled',
};

function StatusTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as { name: string; value: number };
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{row.name}</p>
      <p className="text-xs text-muted-foreground">
        Records: <span className="font-medium text-foreground">{row.value}</span>
      </p>
      <p className="pt-1 text-caption text-muted-foreground">Click to view records</p>
    </div>
  );
}

export function MaintenanceStatusChart() {
  const { data: stats, isLoading } = useMaintenanceStats();
  const { open, setOpen, filter, openDrawer } = useMaintenanceDrawer();

  const chartData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: 'Pending', value: stats.pending },
      { name: 'Overdue', value: stats.overdue },
      { name: 'Completed', value: stats.completed },
    ];
  }, [stats]);

  function handleClick(row: { name: string }) {
    const status = STATUS_FILTER_VALUES[row.name];
    openDrawer({ label: `${row.name} maintenance records`, status: status as any });
  }

  if (isLoading || !stats) return <LoadingState type="card" count={1} />;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <CardTitle className="text-sm font-medium">Records by status</CardTitle>
          {chartData.length > 0 && (
            <ChartExportButton
              filename={slugifyChartFilename('maintenance-records-by-status')}
              sheetName="Records by Status"
              headers={['Status', 'Records']}
              rows={chartData.map((r) => ({ Status: r.name, Records: r.value }))}
            />
          )}
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip content={<StatusTooltip />} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(entry: any) => handleClick(entry)}>
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? '#3b82f6'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <MaintenanceRecordDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}

function CategoryTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as { name: string; value: number };
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{row.name}</p>
      <p className="text-xs text-muted-foreground">
        Records: <span className="font-medium text-foreground">{row.value}</span>
      </p>
      <p className="pt-1 text-caption text-muted-foreground">Click to view records</p>
    </div>
  );
}

export function MaintenanceCategoryChart() {
  const { data: records, isLoading } = useAllMaintenanceRecords();
  const { open, setOpen, filter, openDrawer } = useMaintenanceDrawer();

  const chartData = useMemo(() => {
    if (!records) return [];
    const counts = new Map<string, { name: string; value: number; key: string | undefined }>();
    for (const record of records) {
      const key = record.category;
      const label = key
        ? MAINTENANCE_CATEGORY_LABELS[key as MaintenanceCategory] ?? key
        : 'All';
      const existing = counts.get(label);
      if (existing) {
        existing.value += 1;
      } else {
        counts.set(label, { name: label, value: 1, key });
      }
    }
    return Array.from(counts.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [records]);

  function handleClick(row: { name: string; key?: string }) {
    openDrawer({ label: `${row.name} records`, category: row.key as any });
  }

  if (isLoading) return <LoadingState type="card" count={1} />;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <CardTitle className="text-sm font-medium">Records by category</CardTitle>
          {chartData.length > 0 && (
            <ChartExportButton
              filename={slugifyChartFilename('maintenance-records-by-category')}
              sheetName="Records by Category"
              headers={['Category', 'Records']}
              rows={chartData.map((r) => ({ Category: r.name, Records: r.value }))}
            />
          )}
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} fontSize={12} />
              <YAxis type="category" dataKey="name" width={140} fontSize={11} />
              <Tooltip content={<CategoryTooltip />} />
              <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(entry: any) => handleClick(entry)} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <MaintenanceRecordDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}
