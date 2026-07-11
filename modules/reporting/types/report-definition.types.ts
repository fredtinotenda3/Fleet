// modules/reporting/types/report-definition.types.ts

import { BaseEntity } from '@/shared/types/common.types';
import { DataSourceKey } from './data-source.types';
import { ReportPivotConfig } from './pivot.types';

export type ReportAggregationFn = 'sum' | 'avg' | 'count' | 'min' | 'max';
export type ReportFilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'between';
// Matches shared/validations/report-definition.schema.ts's scheduleConfigSchema.format
// and report-execution.schema.ts's generateExecutionSchema.format -- kept as a literal
// union here rather than importing ExecutionFormat from report-execution.types.ts to
// avoid a circular import (that file needs ReportFilterCondition from this one).
export type ReportExportFormat = 'pdf' | 'excel' | 'csv' | 'word' | 'json';

export interface ReportFilterCondition {
  field: string;
  operator: ReportFilterOperator;
  value: unknown;
  value2?: unknown;
}

export interface ReportGroupBy {
  field: string;
  label?: string;
}

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
  type: 'bar' | 'line' | 'pie' | 'table';
  xField?: string;
  yField?: string;
}

export interface ReportScheduleConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  hourOfDay: number;
  format: ReportExportFormat;
  recipients: string[];
}

export interface ReportDefinition extends BaseEntity {
  name: string;
  description?: string;
  dataSource: DataSourceKey;
  fields: string[];
  filters: ReportFilterCondition[];
  groupBy: ReportGroupBy[];
  aggregations: ReportAggregation[];
  sort?: ReportSortField[];
  pivot?: ReportPivotConfig;
  chart?: ReportChartConfig;
  schedule?: ReportScheduleConfig;
}

export interface ReportDefinitionCreateDTO {
  name: string;
  description?: string;
  dataSource: DataSourceKey;
  fields: string[];
  filters?: ReportFilterCondition[];
  groupBy?: ReportGroupBy[];
  aggregations?: ReportAggregation[];
  sort?: ReportSortField[];
  pivot?: ReportPivotConfig;
  chart?: ReportChartConfig;
  schedule?: ReportScheduleConfig;
}

export interface ReportDefinitionUpdateDTO extends Partial<ReportDefinitionCreateDTO> {
  _id?: string;
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
  totals: Record<string, number>;
  groupSummaries?: ReportGroupSummary[];
}