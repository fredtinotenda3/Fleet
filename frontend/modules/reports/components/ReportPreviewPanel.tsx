// frontend/modules/reports/components/ReportPreviewPanel.tsx
'use client';

import { DataTable } from '@/shared/ui/tables/DataTable';
import { LoadingState } from '@/shared/ui/feedback/LoadingState';
import { EmptyState } from '@/shared/ui/feedback/EmptyState';
import { ReportChartView } from './charts/ReportChartView';
import type { ReportColumn } from '../schemas/reportColumn';

interface ReportResultLike {
  rows: Record<string, unknown>[];
  totalCount?: number;
  aggregates?: Record<string, number>;
}

interface PivotResultLike {
  rowFields: string[];
  columnFields: string[];
  cells: Record<string, Record<string, number>>;
  rowTotals: Record<string, number>;
  columnTotals: Record<string, number>;
  grandTotal: number;
}

interface ChartViewConfig {
  type: 'bar' | 'line' | 'pie';
  xField: string;
  yField: string;
}

interface ReportPreviewPanelProps {
  columns: ReportColumn[];
  isPivot: boolean;
  result: ReportResultLike | PivotResultLike | null;
  isLoading: boolean;
  isError: boolean;
  onRowClick?: (row: Record<string, unknown>) => void;
  chartConfig?: ChartViewConfig;
}

export function ReportPreviewPanel({
  columns,
  isPivot,
  result,
  isLoading,
  isError,
  onRowClick,
  chartConfig,
}: ReportPreviewPanelProps) {
  if (isLoading) {
    return <LoadingState />;
  }

  if (isError) {
    return (
      <EmptyState
        title="Couldn't generate a preview"
        description="Check your filters and columns, then try again."
      />
    );
  }

  if (!result) {
    return (
      <EmptyState
        title="No preview yet"
        description="Give the report a name and at least one column to see live results."
      />
    );
  }

  // If chartConfig is provided, render chart instead of table
  if (chartConfig && !isPivot) {
    const flat = result as ReportResultLike;
    if (!flat.rows || flat.rows.length === 0) {
      return (
        <EmptyState
          title="No data for chart"
          description="Try a different field combination."
        />
      );
    }
    return (
      <ReportChartView
        result={{ columns: columns.map((c) => ({ key: c.field, label: c.label })), rows: flat.rows }}
        chartConfig={chartConfig}
      />
    );
  }

  if (isPivot) {
    const pivot = result as PivotResultLike;
    return (
      <div className="overflow-x-auto border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 font-medium text-left">{pivot.rowFields.join(' / ')}</th>
              {pivot.columnFields.map((col) => (
                <th key={col} className="px-3 py-2 font-medium text-right">
                  {col}
                </th>
              ))}
              <th className="px-3 py-2 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {Object.entries(pivot.cells).map(([rowKey, colValues]) => (
              <tr key={rowKey} className="hover:bg-accent/50">
                <td className="px-3 py-2 font-medium">{rowKey}</td>
                {pivot.columnFields.map((col) => (
                  <td key={col} className="px-3 py-2 text-right tabular-nums">
                    {(colValues[col] ?? 0).toLocaleString()}
                  </td>
                ))}
                <td className="px-3 py-2 font-semibold text-right tabular-nums">
                  {(pivot.rowTotals[rowKey] ?? 0).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="font-semibold border-t bg-muted/50">
            <tr>
              <td className="px-3 py-2">Total</td>
              {pivot.columnFields.map((col) => (
                <td key={col} className="px-3 py-2 text-right tabular-nums">
                  {(pivot.columnTotals[col] ?? 0).toLocaleString()}
                </td>
              ))}
              <td className="px-3 py-2 text-right tabular-nums">{pivot.grandTotal.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  const flat = result as ReportResultLike;
  const visibleColumns = columns.filter((c) => c.visible);
  const rowCount = flat.rows?.length ?? 0;
  const totalCount = flat.totalCount ?? rowCount;

  if (rowCount === 0) {
    return (
      <EmptyState
        title="No records match these filters"
        description="Try widening the date range or removing a filter condition."
      />
    );
  }

  return (
    <div className="space-y-2">
      <DataTable
        columns={visibleColumns.map((c) => ({
          key: c.field,
          header: c.label,
          align:
            c.dataType === 'number' || c.dataType === 'currency' || c.dataType === 'percent'
              ? 'right'
              : 'left',
        }))}
        data={flat.rows}
        onRowClick={onRowClick}
      />
      <p className="text-xs text-muted-foreground">
        Showing {rowCount.toLocaleString()} of {totalCount.toLocaleString()} rows
      </p>
    </div>
  );
}