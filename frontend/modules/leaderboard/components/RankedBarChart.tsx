// frontend/modules/leaderboard/components/RankedBarChart.tsx
//
// The one ranked horizontal bar chart both leaderboards render.
//
// Horizontal (layout="vertical" in Recharts' vocabulary) because the
// category axis carries license plates and driver names -- text that
// does not fit under a vertical bar and would otherwise be rotated 45
// degrees or truncated to nothing. Same orientation and the same
// var(--chart-N) palette as the existing
// MostExpensiveVehiclesChart/RepairFrequencyByVehicleChart, so a reader
// moving between the maintenance analytics page and this one is not
// re-learning the chart.
//
// The chart is a VIEW over an already-ranked list: it never sorts,
// slices or filters. Ranking lives in ../utils/leaderboard.utils.ts
// where it is unit tested; a component that re-sorted its input would
// be a second, untested ranking that could disagree with the table
// beside it.

'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import type { LeaderboardValueFormat, RankedRow } from '../types';
import { formatLeaderboardValue, formatRankLabel, truncateLabel } from '../utils/leaderboard.utils';

/**
 * Five-colour rotation, matching the existing charts. Deliberately not
 * a severity-coloured scale: the bar length already encodes magnitude,
 * and colouring by rank as well would double-encode one variable while
 * leaving no colour channel for anything meaningful.
 */
const BAR_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

/** Row height, and the floor that keeps a 1-2 row chart from collapsing. */
const ROW_HEIGHT = 36;
const MIN_CHART_HEIGHT = 180;

interface ChartDatum {
  key: string;
  axisLabel: string;
  fullLabel: string;
  value: number;
  rankLabel: string;
  /** Extra "Field: value" lines for the tooltip. */
  details: Array<{ label: string; value: string }>;
}

interface RankedBarChartProps<T> {
  rows: ReadonlyArray<RankedRow<T>>;
  /** How the value should be rendered on the axis, the tooltip and any label. */
  format: LeaderboardValueFormat;
  /** What the bar length means, e.g. "Open alerts". Shown as the tooltip's value caption. */
  valueLabel: string;
  isLoading?: boolean;
  /** Additional tooltip lines derived from the row's source record. */
  renderDetails?: (row: RankedRow<T>) => Array<{ label: string; value: string }>;
  emptyTitle?: string;
  emptyDescription?: string;
}

function LeaderboardTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartDatum }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0].payload;

  return (
    <div
      className="space-y-0.5 p-2.5"
      style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
    >
      <p className="text-sm font-medium text-foreground">{datum.fullLabel}</p>
      <p className="text-xs text-muted-foreground">{datum.rankLabel}</p>
      {datum.details.map((detail) => (
        <p key={detail.label} className="text-xs text-muted-foreground">
          {detail.label}: <span className="font-medium text-foreground">{detail.value}</span>
        </p>
      ))}
    </div>
  );
}

export function RankedBarChart<T>({
  rows,
  format,
  valueLabel,
  isLoading = false,
  renderDetails,
  emptyTitle = 'Nothing to rank yet',
  emptyDescription = 'No records in your scope produced a ranking.',
}: RankedBarChartProps<T>) {
  if (isLoading) {
    return <Skeleton className="h-60 w-full" />;
  }

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  const data: ChartDatum[] = rows.map((row) => ({
    // The ranked id is unique per row; the axis label is not (two
    // drivers can share a display name), so keying on the label would
    // silently merge two people into one bar.
    key: row.id,
    axisLabel: truncateLabel(row.label),
    fullLabel: row.label,
    value: row.value,
    rankLabel: formatRankLabel(row),
    details: [
      { label: valueLabel, value: formatLeaderboardValue(row.value, format) },
      ...(renderDetails ? renderDetails(row) : []),
    ],
  }));

  const height = Math.max(MIN_CHART_HEIGHT, data.length * ROW_HEIGHT);

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            stroke="var(--muted-foreground)"
            fontSize={11}
            tickFormatter={(value: number) => formatLeaderboardValue(value, format)}
            // A count axis of 3 alerts must not draw ticks at 0.5 --
            // `allowDecimals` off keeps whole-number metrics honest.
            allowDecimals={format !== 'count'}
          />
          <YAxis
            type="category"
            dataKey="axisLabel"
            stroke="var(--muted-foreground)"
            fontSize={11}
            width={110}
          />
          <Tooltip cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }} content={<LeaderboardTooltip />} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {data.map((datum, index) => (
              <Cell key={datum.key} fill={BAR_COLORS[index % BAR_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
