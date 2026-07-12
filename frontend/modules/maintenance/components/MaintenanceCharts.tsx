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
import { MAINTENANCE_CATEGORY_LABELS, type MaintenanceCategory } from '../types';

const STATUS_COLORS: Record<string, string> = {
  Pending: '#3b82f6',
  Completed: '#22c55e',
  Overdue: '#ef4444',
  Cancelled: '#94a3b8',
};

export function MaintenanceStatusChart() {
  const { data: stats, isLoading } = useMaintenanceStats();

  const chartData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: 'Pending', value: stats.pending },
      { name: 'Overdue', value: stats.overdue },
      { name: 'Completed', value: stats.completed },
    ];
  }, [stats]);

  if (isLoading || !stats) return <LoadingState type="card" count={1} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Records by status</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" fontSize={12} />
            <YAxis allowDecimals={false} fontSize={12} />
            <Tooltip />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? '#3b82f6'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function MaintenanceCategoryChart() {
  const { data: records, isLoading } = useAllMaintenanceRecords();

  const chartData = useMemo(() => {
    if (!records) return [];
    const counts = new Map<string, number>();
    for (const record of records) {
      const key = record.category
        ? MAINTENANCE_CATEGORY_LABELS[record.category as MaintenanceCategory] ?? record.category
        : 'All';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [records]);

  if (isLoading) return <LoadingState type="card" count={1} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Records by category</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} fontSize={12} />
            <YAxis type="category" dataKey="name" width={140} fontSize={11} />
            <Tooltip />
            <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}