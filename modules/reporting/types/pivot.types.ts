// modules/reporting/types/pivot.types.ts

export type PivotAggregator = 'sum' | 'avg' | 'count' | 'min' | 'max';

export interface ReportPivotConfig {
  rowFields: string[];
  columnField: string;
  valueField: string;
  aggregator: PivotAggregator;
}

export interface PivotResult {
  rowKeys: string[];
  columnKeys: string[];
  /** matrix[rowKey][columnKey] = aggregated value */
  matrix: Record<string, Record<string, number>>;
  rowTotals: Record<string, number>;
  columnTotals: Record<string, number>;
  grandTotal: number;
}