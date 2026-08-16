//frontend/modules/maintenance/components/RepairFrequencyByVehicleChart.tsx

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useRepairFrequencyByVehicle } from '../hooks/useMaintenance';
import { useMaintenanceDrawer } from '../hooks/useMaintenanceDrawer';
import { MaintenanceRecordDrawer } from './MaintenanceRecordDrawer';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { RepairFrequencyByVehicleRow } from '../types';

function FrequencyTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as RepairFrequencyByVehicleRow;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{row.license_plate}</p>
      <p className="text-xs text-muted-foreground">Completed records: <span className="font-medium text-foreground">{row.count}</span></p>
      <p className="text-xs text-muted-foreground">Total cost: <span className="font-medium text-foreground">{formatCurrency(row.totalCost)}</span></p>
      <p className="pt-1 text-caption text-muted-foreground">Click to view maintenance records</p>
    </div>
  );
}

export function RepairFrequencyByVehicleChart() {
  const { data, isLoading, error } = useRepairFrequencyByVehicle(20);
  const { open, setOpen, filter, openDrawer } = useMaintenanceDrawer();

  function handleClick(row: RepairFrequencyByVehicleRow) {
    openDrawer({ label: row.license_plate, license_plate: row.license_plate, status: 'completed' as any });
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Repair frequency by vehicle</CardTitle>
            <CardDescription>Vehicles needing maintenance most often &mdash; click a bar for records</CardDescription>
          </div>
          {data && data.length > 0 && (
            <ChartExportButton
              filename={slugifyChartFilename('repair-frequency-by-vehicle')}
              sheetName="Repair Frequency"
              headers={['License Plate', 'Completed Records', 'Total Cost']}
              rows={data.map((r) => ({ 'License Plate': r.license_plate, 'Completed Records': r.count, 'Total Cost': r.totalCost }))}
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
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                  <Tooltip content={<FrequencyTooltip />} />
                  <Bar dataKey="count" fill="var(--chart-4)" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(entry: any) => handleClick(entry)} />
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
