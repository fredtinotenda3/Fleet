// frontend/modules/fuel/components/FuelCostByDriverChart.tsx
// Enterprise analytics #2 -- reuses useFuelByDriver (sortBy='cost')
// rather than a separate query. As of the Vehicle-Operational-Hub
// attribution fix, the service layer behind this hook backs it with
// FuelRepository.getFuelByAssignedDriver (grouped by each vehicle's
// CURRENT driver assignment), not getFuelByDriver (transaction-time) --
// see fuel-query.service.ts's getFuelByDriver doc comment.

'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useFuelByDriver } from '../hooks/useFuel';
import { useFuelDrawer } from '../hooks/useFuelDrawer';
import { FuelLogDrawer } from './FuelLogDrawer';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';
import type { DriverFuelConsumptionRow } from '../types';
import { ChartLoadError } from '@/frontend/shared/ui/ChartLoadError';

const BAR_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

interface FuelCostByDriverChartProps {
  dateRange: FuelAnalyticsDateRange;
  /** Vehicle-Level Analytics: scope this chart to a single vehicle instead of the fleet. */
  licensePlate?: string;
}

function DriverCostTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as DriverFuelConsumptionRow;
  return (
    <div
      style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
      className="p-2.5 space-y-0.5"
    >
      <p className="text-sm font-medium">{row.driverName}</p>
      <p className="text-xs text-muted-foreground">
        Total cost: <span className="font-medium text-foreground">{formatCurrency(row.totalCost)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Total volume: <span className="font-medium text-foreground">{row.totalFuel.toFixed(1)} L</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Fuel entries: <span className="font-medium text-foreground">{row.logCount}</span>
      </p>
      <p className="pt-1 text-caption text-muted-foreground">Click to view fuel logs</p>
    </div>
  );
}

export function FuelCostByDriverChart({ dateRange, licensePlate }: FuelCostByDriverChartProps) {
  const { data, isLoading, error } = useFuelByDriver(dateRange, 10, 'cost', licensePlate);
  const { open, setOpen, filter, openDrawer } = useFuelDrawer();

  function handleClick(row: DriverFuelConsumptionRow) {
    // FIX (driver attribution must come from the Vehicle Operational
    // Hub): this row's driver_id, when set, is now the driver CURRENTLY
    // assigned to a vehicle -- not a value stored on any fuel log -- so
    // filtering the drawer by driver_id would no longer match anything
    // (tblfuellogs doesn't have this driver's id on it). Instead:
    //  - a resolved driver maps to at most one currently-assigned
    //    vehicle (enforced by a partial unique index -- see
    //    Vehicle.currentDriverId's doc comment), so reuse the existing
    //    license_plate filter with that vehicle's plate;
    //  - the "Unassigned" bucket (driver_id === null) has no single
    //    vehicle, so it uses the dedicated unassignedOnly filter instead.
    // When this chart itself is Vehicle-Level-Analytics-scoped
    // (licensePlate prop set), keep that scope on the drawer too --
    // relevant for the "Unassigned" bucket, where a bare unassignedOnly
    // filter would otherwise widen back out to every unassigned vehicle
    // fleet-wide instead of staying on the one vehicle being viewed.
    const targetPlate = row.driver_id ? row.vehiclePlates?.[0] : licensePlate;
    openDrawer({
      label: row.driverName,
      license_plate: targetPlate,
      unassignedOnly: row.driver_id ? undefined : true,
      startDate: dateRange?.startDate,
      endDate: dateRange?.endDate,
    });
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Fuel cost by driver</CardTitle>
            <CardDescription>Highest fuel spend, ranked by driver &mdash; click a bar for details</CardDescription>
          </div>
          {data && data.length > 0 && (
            <ChartExportButton
              filename={slugifyChartFilename('fuel-cost-by-driver')}
              sheetName="Fuel by Driver"
              headers={['Driver', 'Total Cost', 'Total Volume (L)', 'Fuel Entries']}
              rows={data.map((r) => ({
                Driver: r.driverName,
                'Total Cost': r.totalCost,
                'Total Volume (L)': r.totalFuel,
                'Fuel Entries': r.logCount,
              }))}
            />
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg h-60 skeleton" />
          ) : error ? (
            <ChartLoadError />
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No driver-attributed fuel entries in this range.</p>
          ) : (
            <div style={{ width: '100%', height: Math.max(260, data.length * 36) }}>
              <ResponsiveContainer>
                <BarChart data={data} layout="vertical" margin={{ left: 12, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatCurrency(v)} />
                  <YAxis type="category" dataKey="driverName" stroke="var(--muted-foreground)" fontSize={11} width={120} />
                  <Tooltip content={<DriverCostTooltip />} />
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
      <FuelLogDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}