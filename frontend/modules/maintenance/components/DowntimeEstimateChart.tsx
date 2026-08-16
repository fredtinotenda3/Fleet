//frontend/modules/maintenance/components/DowntimeEstimateChart.tsx

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useDowntimeEstimate } from '../hooks/useMaintenance';
import { useMaintenanceDrawer } from '../hooks/useMaintenanceDrawer';
import { MaintenanceRecordDrawer } from './MaintenanceRecordDrawer';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import type { DowntimeEstimatePoint } from '../types';

function DowntimeTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as DowntimeEstimatePoint;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{row.license_plate}</p>
      <p className="text-xs text-muted-foreground">Avg. days past due before completion: <span className="font-medium text-foreground">{row.estimatedDowntimeDays}</span></p>
      <p className="text-xs text-muted-foreground">Records: <span className="font-medium text-foreground">{row.recordCount}</span></p>
      <p className="pt-1 text-caption text-muted-foreground">Click to view maintenance records</p>
    </div>
  );
}

export function DowntimeEstimateChart() {
  const { data, isLoading, error } = useDowntimeEstimate(15);
  const { open, setOpen, filter, openDrawer } = useMaintenanceDrawer();

  function handleClick(row: DowntimeEstimatePoint) {
    openDrawer({ label: row.license_plate, license_plate: row.license_plate, status: 'completed' as any });
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Downtime estimate</CardTitle>
            <CardDescription>
              Proxy metric: average days between due date and completion date per vehicle.
              Not a measured out-of-service duration -- there is no dedicated downtime field today.
              Click a bar for records.
            </CardDescription>
          </div>
          {data && data.length > 0 && (
            <ChartExportButton
              filename={slugifyChartFilename('downtime-estimate')}
              sheetName="Downtime Estimate"
              headers={['License Plate', 'Avg Days Past Due', 'Records']}
              rows={data.map((r) => ({ 'License Plate': r.license_plate, 'Avg Days Past Due': r.estimatedDowntimeDays, Records: r.recordCount }))}
            />
          )}
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
                  <Bar dataKey="estimatedDowntimeDays" fill="var(--chart-5)" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(entry: any) => handleClick(entry)} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      <MaintenanceRecordDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}
