//frontend/modules/maintenance/components/MostExpensiveVehiclesChart.tsx

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useMostExpensiveVehicles } from '../hooks/useMaintenance';
import { useMaintenanceDrawer } from '../hooks/useMaintenanceDrawer';
import { MaintenanceRecordDrawer } from './MaintenanceRecordDrawer';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { MostExpensiveVehicleRow } from '../types';

const BAR_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

function ExpensiveTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as MostExpensiveVehicleRow;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{row.license_plate}</p>
      <p className="text-xs text-muted-foreground">Total cost: <span className="font-medium text-foreground">{formatCurrency(row.totalCost)}</span></p>
      <p className="text-xs text-muted-foreground">Records: <span className="font-medium text-foreground">{row.recordCount}</span></p>
      <p className="pt-1 text-caption text-muted-foreground">Click to view maintenance records</p>
    </div>
  );
}

export function MostExpensiveVehiclesChart() {
  const { data, isLoading, error } = useMostExpensiveVehicles(10);
  const { open, setOpen, filter, openDrawer } = useMaintenanceDrawer();

  function handleClick(row: MostExpensiveVehicleRow) {
    openDrawer({ label: row.license_plate, license_plate: row.license_plate });
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Most expensive vehicles</CardTitle>
            <CardDescription>Highest cumulative maintenance cost &mdash; click a bar for records</CardDescription>
          </div>
          {data && data.length > 0 && (
            <ChartExportButton
              filename={slugifyChartFilename('most-expensive-vehicles')}
              sheetName="Most Expensive Vehicles"
              headers={['License Plate', 'Total Cost', 'Records']}
              rows={data.map((r) => ({ 'License Plate': r.license_plate, 'Total Cost': r.totalCost, Records: r.recordCount }))}
            />
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg h-60 skeleton" />
          ) : error || !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed maintenance records yet.</p>
          ) : (
            <div style={{ width: '100%', height: Math.max(260, data.length * 36) }}>
              <ResponsiveContainer>
                <BarChart data={data} layout="vertical" margin={{ left: 12, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                  <YAxis type="category" dataKey="license_plate" stroke="var(--muted-foreground)" fontSize={11} width={100} />
                  <Tooltip content={<ExpensiveTooltip />} />
                  <Bar dataKey="totalCost" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(entry: any) => handleClick(entry)}>
                    {data.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Bar>
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
