//frontend/modules/maintenance/components/DowntimeEstimateChart.tsx

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useDowntimeEstimate } from '../hooks/useMaintenance';
import type { DowntimeEstimatePoint } from '../types';

function DowntimeTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as DowntimeEstimatePoint;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{row.license_plate}</p>
      <p className="text-xs text-muted-foreground">Avg. days past due before completion: <span className="font-medium text-foreground">{row.estimatedDowntimeDays}</span></p>
      <p className="text-xs text-muted-foreground">Records: <span className="font-medium text-foreground">{row.recordCount}</span></p>
    </div>
  );
}

export function DowntimeEstimateChart() {
  const { data, isLoading, error } = useDowntimeEstimate(15);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Downtime estimate</CardTitle>
        <CardDescription>
          Proxy metric: average days between due date and completion date per vehicle.
          Not a measured out-of-service duration -- there is no dedicated downtime field today.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No completed maintenance records yet.</p>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={data} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="license_plate" stroke="var(--muted-foreground)" fontSize={11} interval={0} angle={-35} textAnchor="end" height={60} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip content={<DowntimeTooltip />} />
                <Bar dataKey="estimatedDowntimeDays" fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}