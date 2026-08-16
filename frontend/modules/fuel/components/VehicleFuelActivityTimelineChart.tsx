// frontend/modules/fuel/components/VehicleFuelActivityTimelineChart.tsx
// Enterprise analytics #1

'use client';

import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { useVehiclesList } from '@/frontend/modules/vehicles/hooks/useVehicles';
import { useVehicleFuelTimeline } from '../hooks/useFuel';
import { useFuelDrawer } from '../hooks/useFuelDrawer';
import { FuelLogDrawer } from './FuelLogDrawer';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';
import type { VehicleFuelTimelinePoint } from '../types';

const ALL_VEHICLES = '__all__';

interface VehicleFuelActivityTimelineChartProps {
  dateRange: FuelAnalyticsDateRange;
  /**
   * Vehicle-Level Analytics: when provided, this chart is locked to the
   * given vehicle -- the fleet-wide vehicle picker is hidden instead of
   * defaulting to "All vehicles". Used by VehicleFuelAnalyticsPanel.
   */
  licensePlate?: string;
}

function TimelineTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as VehicleFuelTimelinePoint;
  return (
    <div
      style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
      className="p-2.5 space-y-0.5"
    >
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">
        Fuel entries: <span className="font-medium text-foreground">{row.count}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Fuel volume: <span className="font-medium text-foreground">{row.volume.toFixed(1)} L</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Fuel cost: <span className="font-medium text-foreground">{formatCurrency(row.cost)}</span>
      </p>
      <p className="pt-1 text-caption text-muted-foreground">Click to view fuel logs</p>
    </div>
  );
}

/** Best-effort day range for a timeline point's date label ("2026-07-14" or similar). */
function dayRange(date: string): { startDate?: Date; endDate?: Date } {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return {};
  const startDate = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  return { startDate, endDate };
}

export function VehicleFuelActivityTimelineChart({ dateRange, licensePlate }: VehicleFuelActivityTimelineChartProps) {
  const locked = Boolean(licensePlate);
  const [vehicle, setVehicle] = useState<string>(ALL_VEHICLES);
  // Always called (rules of hooks) even when locked; the fetched list is
  // simply not rendered in that case. Matches the existing fleet-wide
  // FuelAnalyticsPage usage of this component exactly.
  const { data: vehicles } = useVehiclesList({ limit: 1000 });
  const effectivePlate = locked ? licensePlate : vehicle === ALL_VEHICLES ? undefined : vehicle;
  const { data, isLoading, error } = useVehicleFuelTimeline(effectivePlate, dateRange);
  const { open, setOpen, filter, openDrawer } = useFuelDrawer();

  function handleClick(row: VehicleFuelTimelinePoint) {
    const { startDate, endDate } = dayRange(row.date);
    openDrawer({ label: `${row.date} fuel logs`, license_plate: effectivePlate, startDate, endDate });
  }

  return (
    <>
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Vehicle fuel activity timeline</CardTitle>
          <CardDescription>
            {locked ? 'Fuel entries over time for this vehicle' : 'Fuel entries over time, per vehicle or fleet-wide'}
            {' '}&mdash; click a point for details
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
        {data && data.length > 0 && (
          <ChartExportButton
            filename={slugifyChartFilename('vehicle-fuel-activity-timeline')}
            sheetName="Fuel Activity Timeline"
            headers={['Date', 'Entries', 'Volume (L)', 'Cost']}
            rows={data.map((r) => ({ Date: r.date, Entries: r.count, 'Volume (L)': r.volume, Cost: r.cost }))}
          />
        )}
        {!locked && (
          <Select value={vehicle} onValueChange={(value) => setVehicle(value ?? ALL_VEHICLES)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VEHICLES}>All vehicles</SelectItem>
              {vehicles?.data?.map((v) => (
                <SelectItem key={v._id} value={v.license_plate}>{v.license_plate}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fuel entries in this range.</p>
        ) : (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={data} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip content={<TimelineTooltip />} />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  name="Entries"
                  dot={{ r: 3, cursor: 'pointer' }}
                  activeDot={{ r: 5, cursor: 'pointer', onClick: (_: any, e: any) => handleClick(e.payload) }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
    <FuelLogDrawer open={open} onOpenChange={setOpen} filter={filter} />
    </>
  );
}