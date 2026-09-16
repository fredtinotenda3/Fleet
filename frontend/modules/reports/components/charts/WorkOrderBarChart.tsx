// frontend/modules/reports/components/charts/WorkOrderBarChart.tsx
//
// R.3.6 -- Work Order Reporting. A single, parametrized bar chart
// backing both the status-distribution and priority-distribution charts
// on WorkOrderReports.tsx (and any future work-order breakdown), rather
// than two near-duplicate copies of MaintenanceChart.tsx. Structurally
// identical to the existing chart components in this directory
// (FuelTrendChart/ExpenseBreakdownChart/MaintenanceChart): the same
// isLoading -> isRestricted -> isError -> empty -> chart ordering, the
// same ChartExportButton, the same optional click-to-drill-down.
'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ChartContainer } from '@/frontend/shared/ui/charts';
import { Skeleton } from '@/frontend/shared/ui/feedback/skeleton';
import { ChartExportButton, slugifyChartFilename } from '@/frontend/shared/charts/ChartExportButton';

export interface WorkOrderBarChartDatum {
  name: string;
  count: number;
  /** Raw filter value this bar drills down to (e.g. the status/priority key), when it differs from the display `name`. */
  filterValue?: string;
}

interface WorkOrderBarChartProps {
  title: string;
  data: WorkOrderBarChartDatum[] | undefined;
  isLoading: boolean;
  /** True when the caller lacks WORKORDER_VIEW (a 403 from /api/workorders/stats). Checked before the empty-data branch so a restricted viewer sees "Restricted", not a false "no work orders" claim. */
  isRestricted?: boolean;
  /** A genuine fetch failure (network/5xx) -- distinct from isRestricted. */
  isError?: boolean;
  emptyMessage: string;
  restrictedMessage: string;
  /** Bars whose `name` matches one of these render in the destructive color (e.g. "Cancelled", "Critical"). Purely visual -- does not affect data. */
  highlightNames?: string[];
  onBarClick?: (entry: WorkOrderBarChartDatum) => void;
  exportFilenamePrefix: string;
  exportColumnLabel: string;
}

export function WorkOrderBarChart({
  title,
  data,
  isLoading,
  isRestricted,
  isError,
  emptyMessage,
  restrictedMessage,
  highlightNames = [],
  onBarClick,
  exportFilenamePrefix,
  exportColumnLabel,
}: WorkOrderBarChartProps) {
  if (isLoading) {
    return (
      <ChartContainer title={title}>
        <Skeleton className="h-64 w-full" />
      </ChartContainer>
    );
  }

  if (isRestricted) {
    return (
      <ChartContainer title={title}>
        <p className="text-sm text-muted-foreground">{restrictedMessage}</p>
      </ChartContainer>
    );
  }

  if (isError) {
    return (
      <ChartContainer title={title}>
        <p className="text-sm text-destructive">Couldn&apos;t load this chart right now.</p>
      </ChartContainer>
    );
  }

  if (!data || data.length === 0) {
    return (
      <ChartContainer title={title}>
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer
      title={title}
      actions={
        <ChartExportButton
          filename={slugifyChartFilename(exportFilenamePrefix)}
          sheetName={title}
          headers={[exportColumnLabel, 'Count']}
          rows={data.map((r) => ({ [exportColumnLabel]: r.name, Count: r.count }))}
        />
      }
    >
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value: number, _name: string, item: any) => [`${value} work orders`, item.payload.name]} />
          <Bar
            dataKey="count"
            fill="var(--primary)"
            radius={[4, 4, 0, 0]}
            cursor={onBarClick ? 'pointer' : undefined}
            onClick={onBarClick ? (entry: any) => onBarClick(entry) : undefined}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={highlightNames.includes(entry.name) ? 'var(--destructive)' : 'var(--primary)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {onBarClick && <p className="mt-2 text-caption text-muted-foreground">Click a bar to view those work orders</p>}
    </ChartContainer>
  );
}
