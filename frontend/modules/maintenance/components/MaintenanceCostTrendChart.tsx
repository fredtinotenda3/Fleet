// frontend/modules/maintenance/components/MaintenanceCostTrendChart.tsx

'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useMaintenanceCostTrend } from '../hooks/useMaintenance';
import { useMaintenanceDrawer } from '../hooks/useMaintenanceDrawer';
import { MaintenanceRecordDrawer } from './MaintenanceRecordDrawer';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { MaintenanceCostTrendPoint } from '../types';

interface MaintenanceCostTrendChartProps {
  /**
   * Vehicle-Level Analytics: when set, narrows the SAME monthly cost
   * trend calculation to a single vehicle. Omitted on the fleet
   * Maintenance Analytics page; passed by VehicleMaintenanceAnalyticsPanel.
   */
  licensePlate?: string;
}

/** "2026-07" -> "Jul 2026" */
function monthLabel(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function monthRange(month: string): { startDate?: Date; endDate?: Date } {
  if (!/^\d{4}-\d{2}$/.test(month)) return {};
  const [y, m] = month.split('-').map(Number);
  return { startDate: new Date(Date.UTC(y, m - 1, 1)), endDate: new Date(Date.UTC(y, m, 1)) };
}

function CostTrendTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as MaintenanceCostTrendPoint;
  return (
    <div style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }} className="p-2.5 space-y-0.5">
      <p className="text-sm font-medium">{monthLabel(row.month)}</p>
      <p className="text-xs text-muted-foreground">
        Cost: <span className="font-medium text-foreground">{formatCurrency(row.totalCost)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Records: <span className="font-medium text-foreground">{row.count}</span>
      </p>
      <p className="pt-1 text-caption text-muted-foreground">Click to view maintenance records</p>
    </div>
  );
}

export function MaintenanceCostTrendChart({ licensePlate }: MaintenanceCostTrendChartProps) {
  const { data, isLoading, error } = useMaintenanceCostTrend(12, licensePlate);
  const { open, setOpen, filter, openDrawer } = useMaintenanceDrawer();

  function handleClick(row: MaintenanceCostTrendPoint) {
    const { startDate, endDate } = monthRange(row.month);
    openDrawer({
      label: `${monthLabel(row.month)} maintenance`,
      license_plate: licensePlate,
      status: 'completed' as any,
      startDate,
      endDate,
    });
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Maintenance cost trend</CardTitle>
            <CardDescription>Estimated cost of completed maintenance, by month &mdash; click a point for details</CardDescription>
          </div>
          {data && data.length > 0 && (
            <ChartExportButton
              filename={slugifyChartFilename('maintenance-cost-trend')}
              sheetName="Maintenance Cost Trend"
              headers={['Month', 'Total Cost', 'Records']}
              rows={data.map((r) => ({ Month: monthLabel(r.month), 'Total Cost': r.totalCost, Records: r.count }))}
            />
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg h-60 skeleton" />
          ) : error || !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed maintenance in this range.</p>
          ) : (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={data} margin={{ left: -10, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tickFormatter={monthLabel} stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip content={<CostTrendTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="totalCost"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    name="totalCost"
                    dot={{ r: 3, cursor: 'pointer' }}
                    activeDot={{ r: 5, cursor: 'pointer', onClick: (_: any, e: any) => handleClick(e.payload) }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      <MaintenanceRecordDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}
