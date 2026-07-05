// modules/reporting/types/report-definition.types.ts

import { BaseEntity } from '@/shared/types/common.types';
import { DataSourceKey } from './data-source.types';
import { ReportPivotConfig } from './pivot.types';
import { ExecutionFormat } from './report-execution.types';

export type ReportFilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'contains'
  | 'between';

export interface ReportFilterCondition {
  field: string;
  operator: ReportFilterOperator;
  value: unknown;
  /** Only used for operator 'between'. */
  value2?: unknown;
}

export interface ReportGroupBy {
  field: string;
  label?: string;
}

export type ReportAggregationFn = 'sum' | 'avg' | 'count' | 'min' | 'max';

export interface ReportAggregation {
  field: string;
  fn: ReportAggregationFn;
  alias: string;
}

export interface ReportSort {
  field: string;
  direction: 'asc' | 'desc';
}

export type ReportChartType = 'bar' | 'line' | 'pie' | 'table';

export interface ReportChartConfig {
  type: ReportChartType;
  xField?: string;
  yField?: string;
}

export interface ReportScheduleConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  dayOfWeek?: number; // 0-6, weekly only
  dayOfMonth?: number; // 1-28, monthly only
  hourOfDay: number; // 0-23, tenant-local hour the job fires at
  format: ExecutionFormat;
  recipients: string[];
}

/**
 * A saved, reusable report configuration. This is the "Report Builder"
 * artifact: pick a data source, pick fields, filter/group/aggregate/sort,
 * optionally pivot and/or chart it, optionally schedule recurring runs.
 */
export interface ReportDefinition extends BaseEntity {
  name: string;
  description?: string;
  dataSource: DataSourceKey;
  /** Field keys selected for the flat (non-grouped) view / column set. */
  fields: string[];
  filters: ReportFilterCondition[];
  groupBy: ReportGroupBy[];
  aggregations: ReportAggregation[];
  sort?: ReportSort[];
  pivot?: ReportPivotConfig;
  chart?: ReportChartConfig;
  schedule?: ReportScheduleConfig;
  isTemplateInstance?: boolean;
  sourceTemplateId?: string;
}

export interface ReportDefinitionCreateDTO {
  name: string;
  description?: string;
  dataSource: DataSourceKey;
  fields: string[];
  filters?: ReportFilterCondition[];
  groupBy?: ReportGroupBy[];
  aggregations?: ReportAggregation[];
  sort?: ReportSort[];
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
  type: 'string' | 'number' | 'date' | 'boolean' | 'currency';
}

export interface ReportGroupSummary {
  key: string;
  label: string;
  count: number;
  aggregates: Record<string, number>;
}

/** The generic tabular output every data source ultimately renders down to. */
export interface ReportResult {
  columns: ReportResultColumn[];
  rows: Array<Record<string, unknown>>;
  totals?: Record<string, number>;
  groupSummaries?: ReportGroupSummary[];
}