// modules/reporting/services/pivot.engine.ts
//
// No changes needed here: PivotEngine operates purely on a ReportResult
// already in memory (result.rows) and has no knowledge of where those
// rows came from. The fix that matters for pivot accuracy is upstream,
// in report-builder.service.ts#previewPivot and
// report-execution.service.ts#buildBuffer, which now call
// reportQueryEngine.runFull() instead of run() so the FULL matching
// row set (up to FULL_RESULT_CAP) is pivoted, not just a 100-row
// preview page.

import { ReportPivotConfig, PivotResult, PivotAggregator } from '../types/pivot.types';
import { ReportResult } from '../types/report-definition.types';

function aggregateValues(values: number[], aggregator: PivotAggregator): number {
  if (values.length === 0) return 0;
  switch (aggregator) {
    case 'sum':
      return values.reduce((s, v) => s + v, 0);
    case 'avg':
      return values.reduce((s, v) => s + v, 0) / values.length;
    case 'count':
      return values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
  }
}

export class PivotEngine {
  /**
   * Pivots a flat ReportResult (definition.groupBy/aggregations left
   * empty -- pivot works off raw rows, not a pre-grouped result) into a
   * rowField(s) x columnField matrix, aggregating valueField into each
   * cell.
   */
  pivot(result: ReportResult, config: ReportPivotConfig): PivotResult {
    const cellValues = new Map<string, Map<string, number[]>>();
    const rowKeySet = new Set<string>();
    const columnKeySet = new Set<string>();

    for (const row of result.rows) {
      const rowKey = config.rowFields.map((f) => String(row[f] ?? '')).join(' / ');
      const columnKey = String(row[config.columnField] ?? '');
      const value = Number(row[config.valueField]);
      if (Number.isNaN(value)) continue;

      rowKeySet.add(rowKey);
      columnKeySet.add(columnKey);

      if (!cellValues.has(rowKey)) cellValues.set(rowKey, new Map());
      const columnMap = cellValues.get(rowKey)!;
      if (!columnMap.has(columnKey)) columnMap.set(columnKey, []);
      columnMap.get(columnKey)!.push(value);
    }

    const rowKeys = Array.from(rowKeySet).sort();
    const columnKeys = Array.from(columnKeySet).sort();

    const matrix: Record<string, Record<string, number>> = {};
    const rowTotals: Record<string, number> = {};
    const columnTotals: Record<string, number> = {};
    let grandTotal = 0;

    for (const rowKey of rowKeys) {
      matrix[rowKey] = {};
      let rowSum = 0;
      for (const columnKey of columnKeys) {
        const values = cellValues.get(rowKey)?.get(columnKey) ?? [];
        const aggregated = aggregateValues(values, config.aggregator);
        matrix[rowKey][columnKey] = aggregated;
        rowSum += aggregated;
        columnTotals[columnKey] = (columnTotals[columnKey] ?? 0) + aggregated;
      }
      rowTotals[rowKey] = rowSum;
      grandTotal += rowSum;
    }

    return { rowKeys, columnKeys, matrix, rowTotals, columnTotals, grandTotal };
  }
}

export const pivotEngine = new PivotEngine();