// frontend/modules/fuel/components/FuelByStationChart.tsx
// Enterprise analytics #4 (Fuel Spend by Station) + #8 (Top Fuel Stations),
// backed by the single shared useFuelByStation query -- sorted by the
// selected metric client-side rather than issuing two separate queries.

'use client';

import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/shared/ui/forms/select';
import { useFuelByStation } from '../hooks/useFuel';
import { useFuelDrawer } from '../hooks/useFuelDrawer';
import { FuelLogDrawer } from './FuelLogDrawer';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';
import { formatCurrency } from '@/shared/utils/currency.utils';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';
import type { FuelByStationRow } from '../types';

type SortMode = 'spend' | 'visits';

const BAR_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

interface FuelByStationChartProps {
  dateRange: FuelAnalyticsDateRange;
  /** Vehicle-Level Analytics: scope this chart to a single vehicle instead of the fleet. */
  licensePlate?: string;
}

function StationTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload as FuelByStationRow;
  return (
    <div
      style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
      className="p-2.5 space-y-0.5"
    >
      <p className="text-sm font-medium">{row.stationName}</p>
      <p className="text-xs text-muted-foreground">
        Total spend: <span className="font-medium text-foreground">{formatCurrency(row.totalSpend)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Total volume: <span className="font-medium text-foreground">{row.totalLitres.toFixed(1)} L</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Transactions: <span className="font-medium text-foreground">{row.visits}</span>
      </p>
      <p className="pt-1 text-caption text-muted-foreground">Click to view fuel logs</p>
    </div>
  );
}

export function FuelByStationChart({ dateRange, licensePlate }: FuelByStationChartProps) {
  const [sortMode, setSortMode] = useState<SortMode>('spend');
  const { data, isLoading, error } = useFuelByStation(dateRange, 15, licensePlate);
  const { open, setOpen, filter, openDrawer } = useFuelDrawer();

  const sorted = useMemo(() => {
    if (!data) return [];
    const rows = [...data];
    rows.sort((a, b) => (sortMode === 'spend' ? b.totalSpend - a.totalSpend : b.visits - a.visits));
    return rows.slice(0, 10);
  }, [data, sortMode]);

  function handleClick(row: FuelByStationRow) {
    openDrawer({
      label: row.stationName,
      fuel_station_id: (row as any).stationId ?? undefined,
      license_plate: licensePlate,
      startDate: dateRange?.startDate,
      endDate: dateRange?.endDate,
    });
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>{sortMode === 'spend' ? 'Fuel spend by station' : 'Top fuel stations'}</CardTitle>
            <CardDescription>
              {sortMode === 'spend' ? 'Highest total spend, per station' : 'Most frequently used stations'} &mdash; click a bar for details
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="spend">By spend</SelectItem>
                <SelectItem value="visits">By visits</SelectItem>
              </SelectContent>
            </Select>
            <ChartExportButton
              filename={slugifyChartFilename('fuel-by-station')}
              sheetName="Fuel by Station"
              headers={['Station', 'Total Spend', 'Total Volume (L)', 'Visits']}
              rows={sorted.map((r) => ({
                Station: r.stationName,
                'Total Spend': r.totalSpend,
                'Total Volume (L)': r.totalLitres,
                Visits: r.visits,
              }))}
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg h-60 skeleton" />
          ) : error || sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">No station data in this range.</p>
          ) : (
            <div style={{ width: '100%', height: Math.max(260, sorted.length * 36) }}>
              <ResponsiveContainer>
                <BarChart data={sorted} layout="vertical" margin={{ left: 12, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickFormatter={(v) => (sortMode === 'spend' ? formatCurrency(v) : String(v))}
                  />
                  <YAxis type="category" dataKey="stationName" stroke="var(--muted-foreground)" fontSize={11} width={130} />
                  <Tooltip content={<StationTooltip />} />
                  <Bar
                    dataKey={sortMode === 'spend' ? 'totalSpend' : 'visits'}
                    radius={[0, 4, 4, 0]}
                    cursor="pointer"
                    onClick={(entry: any) => handleClick(entry)}
                  >
                    {sorted.map((_, i) => (
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