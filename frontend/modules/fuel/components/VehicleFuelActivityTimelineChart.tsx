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
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';
import type { VehicleFuelTimelinePoint } from '../types';

const ALL_VEHICLES = '__all__';

interface VehicleFuelActivityTimelineChartProps {
  dateRange: FuelAnalyticsDateRange;
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
    </div>
  );
}

export function VehicleFuelActivityTimelineChart({ dateRange }: VehicleFuelActivityTimelineChartProps) {
  const [vehicle, setVehicle] = useState<string>(ALL_VEHICLES);
  const { data: vehicles } = useVehiclesList({ limit: 1000 });
  const { data, isLoading, error } = useVehicleFuelTimeline(
    vehicle === ALL_VEHICLES ? undefined : vehicle,
    dateRange
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Vehicle fuel activity timeline</CardTitle>
          <CardDescription>Fuel entries over time, per vehicle or fleet-wide</CardDescription>
        </div>
        <Select value={vehicle} onValueChange={(value) => setVehicle(value ?? ALL_VEHICLES)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VEHICLES}>All vehicles</SelectItem>
            {vehicles?.data?.map((v) => (
              <SelectItem key={v._id} value={v.license_plate}>{v.license_plate}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                <Line type="monotone" dataKey="count" stroke="var(--chart-1)" strokeWidth={2} dot={false} name="Entries" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}