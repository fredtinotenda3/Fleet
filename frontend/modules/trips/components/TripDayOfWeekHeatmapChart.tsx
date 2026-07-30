// frontend/modules/trips/components/TripDayOfWeekHeatmapChart.tsx
//
// VEHICLE-SCOPE ADDITION: optional `licensePlate` prop, forwarded to
// useTripDayOfWeekHeatmap.

'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useTripDayOfWeekHeatmap } from '../hooks/useTripAnalytics';

interface TripDayOfWeekHeatmapChartProps {
  dateRange?: { startDate?: Date; endDate?: Date };
  licensePlate?: string;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function TripDayOfWeekHeatmapChart({ dateRange, licensePlate }: TripDayOfWeekHeatmapChartProps) {
  const { data, isLoading, error } = useTripDayOfWeekHeatmap(dateRange, licensePlate);

  const grid = useMemo(() => {
    const cells = new Map<string, { count: number; distance: number }>();
    let max = 0;
    for (const cell of data ?? []) {
      cells.set(`${cell.dayOfWeek}-${cell.hour}`, { count: cell.count, distance: cell.distance });
      if (cell.count > max) max = cell.count;
    }
    return { cells, max };
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Trip activity heatmap</CardTitle></CardHeader>
        <CardContent><div className="rounded-lg h-65 skeleton" /></CardContent>
      </Card>
    );
  }

  if (error || !data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trip activity heatmap</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  function intensity(count: number): string {
    if (grid.max === 0 || count === 0) return 'var(--muted)';
    const ratio = count / grid.max;
    if (ratio < 0.25) return 'color-mix(in srgb, var(--chart-1) 25%, transparent)';
    if (ratio < 0.5) return 'color-mix(in srgb, var(--chart-1) 50%, transparent)';
    if (ratio < 0.75) return 'color-mix(in srgb, var(--chart-1) 75%, transparent)';
    return 'var(--chart-1)';
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trip activity heatmap</CardTitle>
        <CardDescription>
          {licensePlate ? 'This vehicle\u2019s trips by day of week and hour' : 'Trips by day of week and hour'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `40px repeat(24, 20px)` }}>
            <div />
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="text-center text-muted-foreground" style={{ fontSize: 9 }}>{h}</div>
            ))}
            {DAY_LABELS.map((label, dayIdx) => (
              <div key={label} className="contents">
                <div className="flex items-center text-caption text-muted-foreground">{label}</div>
                {Array.from({ length: 24 }, (_, hour) => {
                  const cell = grid.cells.get(`${dayIdx}-${hour}`);
                  return (
                    <div
                      key={hour}
                      title={cell ? `${cell.count} trips` : '0 trips'}
                      className="rounded-sm"
                      style={{ width: 18, height: 18, backgroundColor: intensity(cell?.count ?? 0) }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}