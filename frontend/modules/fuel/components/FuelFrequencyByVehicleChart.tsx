// frontend/modules/fuel/components/FuelFrequencyByVehicleChart.tsx
// Enterprise analytics #7

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useFuelingFrequencyByVehicle } from '../hooks/useFuel';
import { useFuelDrawer } from '../hooks/useFuelDrawer';
import { FuelLogDrawer } from './FuelLogDrawer';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';
import type { FuelFrequencyByVehicleRow } from '../types';

interface FuelFrequencyByVehicleChartProps {
  dateRange: FuelAnalyticsDateRange;
  /**
   * Vehicle-Level Analytics: scoping is supported by the underlying query
   * for API consistency, but a "frequency by vehicle" ranking collapses
   * to a single bar at vehicle scope -- not meaningful on a vehicle
   * dashboard. Kept fleet-only in practice.
   */
  licensePlate?: string;
}

function FrequencyTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as FuelFrequencyByVehicleRow;
  return (
    <div
      style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
      className="p-2.5 space-y-0.5"
    >
      <p className="text-sm font-medium">{row.license_plate}</p>
      <p className="text-xs text-muted-foreground">
        Fuel events: <span className="font-medium text-foreground">{row.count}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Total volume: <span className="font-medium text-foreground">{row.totalVolume.toFixed(1)} L</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Total cost: <span className="font-medium text-foreground">{formatCurrency(row.totalCost)}</span>
      </p>
      <p className="pt-1 text-caption text-muted-foreground">Click to view fuel logs</p>
    </div>
  );
}

export function FuelFrequencyByVehicleChart({ dateRange, licensePlate }: FuelFrequencyByVehicleChartProps) {
  const { data, isLoading, error } = useFuelingFrequencyByVehicle(dateRange, 20, licensePlate);
  const { open, setOpen, filter, openDrawer } = useFuelDrawer();

  function handleClick(row: FuelFrequencyByVehicleRow) {
    openDrawer({
      label: row.license_plate,
      license_plate: row.license_plate,
      startDate: dateRange?.startDate,
      endDate: dateRange?.endDate,
    });
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Fueling frequency by vehicle</CardTitle>
            <CardDescription>Number of fuel events per vehicle -- click a bar for details</CardDescription>
          </div>
          {data && data.length > 0 && (
            <ChartExportButton
              filename={slugifyChartFilename('fuel-frequency-by-vehicle')}
              sheetName="Fueling Frequency"
              headers={['License Plate', 'Fuel Events', 'Total Volume (L)', 'Total Cost']}
              rows={data.map((r) => ({
                'License Plate': r.license_plate,
                'Fuel Events': r.count,
                'Total Volume (L)': r.totalVolume,
                'Total Cost': r.totalCost,
              }))}
            />
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg h-60 skeleton" />
          ) : error || !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No fuel entries in this range.</p>
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
      <FuelLogDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}