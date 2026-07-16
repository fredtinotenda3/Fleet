// frontend/modules/fuel/components/FuelEntryHeatmapChart.tsx
// Enterprise analytics #10 -- day-of-week x hour-of-day heatmap.
// Plain CSS grid rather than recharts, which has no native heatmap type.

'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/frontend/shared/ui/data-display/card';
import { useFuelEntryHeatmap } from '../hooks/useFuel';
import type { FuelAnalyticsDateRange } from './FuelAnalyticsFilterBar';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface FuelEntryHeatmapChartProps {
  dateRange: FuelAnalyticsDateRange;
}

export function FuelEntryHeatmapChart({ dateRange }: FuelEntryHeatmapChartProps) {
  const { data, isLoading, error } = useFuelEntryHeatmap(dateRange);

  const { grid, max } = useMemo(() => {
    const cells = new Map<string, number>();
    let maxCount = 0;
    for (const cell of data ?? []) {
      cells.set(`${cell.dayOfWeek}-${cell.hour}`, cell.count);
      if (cell.count > maxCount) maxCount = cell.count;
    }
    return { grid: cells, max: maxCount };
  }, [data]);

  function intensity(count: number): string {
    if (max === 0 || count === 0) return 'transparent';
    const ratio = count / max;
    return `color-mix(in srgb, var(--chart-1) ${Math.round(ratio * 90) + 10}%, transparent)`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fuel entry heatmap</CardTitle>
        <CardDescription>When fueling activity happens most -- day of week vs. hour of day</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="rounded-lg h-60 skeleton" />
        ) : error || !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fuel entries in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `40px repeat(24, 20px)` }}>
              <div />
              {HOURS.map((h) => (
                <div key={h} className="text-[9px] text-center text-muted-foreground">{h}</div>
              ))}
              {DAY_LABELS.map((label, dayIndex) => (
                <div key={label} className="contents">
                  <div className="flex items-center text-xs text-muted-foreground">{label}</div>
                  {HOURS.map((h) => {
                    const count = grid.get(`${dayIndex}-${h}`) ?? 0;
                    return (
                      <div
                        key={h}
                        title={`${label} ${h}:00 \u2014 ${count} ${count === 1 ? 'entry' : 'entries'}`}
                        className="w-5 h-5 border rounded-sm border-border/40"
                        style={{ backgroundColor: intensity(count) }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Note: entries logged without a specific time default to hour 0 -- the hour axis is most useful once imported/telematics data carries real timestamps.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}