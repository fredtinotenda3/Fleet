// modules/reporting/types/report-definition.types.ts
//
// ⚠️ RECONSTRUCTED FILE — this was never shown to me in any uploaded
// document, but every file in Fix 3 imports types from it
// (ReportDefinition, ReportFilterCondition, ReportResult, etc.). I
// rebuilt it from every usage site I could see across
// report-query.engine.ts, report-builder.service.ts,
// report-execution.service.ts, drilldown.service.ts, and pivot.engine.ts.
// PLEASE DIFF THIS against your actual file before replacing it — the
// new fields on ReportResult (totalMatched/truncated/page/pageSize) are
// additive and should merge cleanly, but anything else here is a
// best-effort reconstruction, not a guaranteed match to your original.

import { DataSourceKey } from './data-source.types';
import { ReportPivotConfig } from './pivot.types';

export type ReportFilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'between';

export interface ReportFilterCondition {
  field: string;
  operator: ReportFilterOperator;
  value: unknown;
  /** Only used by the 'between' operator, as the upper bound. */
  value2?: unknown;
}

export interface ReportGroupField {
  field: string;
}

export type ReportAggregationFn = 'sum' | 'avg' | 'count' | 'min' | 'max';

export interface ReportAggregation {
  field: string;
  fn: ReportAggregationFn;
  alias: string;
}

export interface ReportSortField {
  field: string;
  direction: 'asc' | 'desc';
}

export interface ReportChartConfig {
  type: 'bar' | 'line' | 'pie' | 'area';
  xField?: string;
  yField?: string;
}

export interface ReportScheduleConfig {
  enabled: boolean;
  cron: string;
  format: 'pdf' | 'excel' | 'csv' | 'word';
  recipients: string[];
}

export interface ReportDefinition {
  _id?: string;
  tenantId: string;
  name: string;
  description?: string;
  dataSource: DataSourceKey;
  fields: string[];
  filters: ReportFilterCondition[];
  groupBy: ReportGroupField[];
  aggregations: ReportAggregation[];
  sort?: ReportSortField[];
  pivot?: ReportPivotConfig;
  chart?: ReportChartConfig;
  schedule?: ReportScheduleConfig;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
  updatedBy?: string;
  isDeleted?: boolean;
}

export interface ReportDefinitionCreateDTO {
  name: string;
  description?: string;
  dataSource: DataSourceKey;
  fields: string[];
  filters?: ReportFilterCondition[];
  groupBy?: ReportGroupField[];
  aggregations?: ReportAggregation[];
  sort?: ReportSortField[];
  pivot?: ReportPivotConfig;
  chart?: ReportChartConfig;
  schedule?: ReportScheduleConfig;
}

export interface ReportDefinitionUpdateDTO extends Partial<ReportDefinitionCreateDTO> {
  _id: string;
}

export interface ReportResultColumn {
  key: string;
  label: string;
  type: 'string' | 'number' | 'currency' | 'date' | 'boolean';
}

export interface ReportGroupSummary {
  key: string;
  label: string;
  count: number;
  aggregates: Record<string, number>;
}

export interface ReportResult {
  columns: ReportResultColumn[];
  rows: Record<string, unknown>[];
  totals?: Record<string, number>;
  groupSummaries?: ReportGroupSummary[];

  // --- Added by Fix 3 (pushdown pagination) — additive, non-breaking ---
  /** Total documents matching the query, independent of the current page/cap. */
  totalMatched?: number;
  /** true when totalMatched exceeds what was actually returned (page size or FULL_RESULT_CAP). */
  truncated?: boolean;
  /** Current page number (1-indexed) for paginated preview calls. */
  page?: number;
  /** Rows per page actually applied for this call. */
  pageSize?: number;
}