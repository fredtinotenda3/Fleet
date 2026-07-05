// modules/reporting/types/kpi.types.ts

import { BaseEntity } from '@/shared/types/common.types';
import { DataSourceKey } from './data-source.types';
import { ReportAggregation, ReportFilterCondition } from './report-definition.types';

export type KPIThresholdDirection = 'higher_is_better' | 'lower_is_better';

export interface KPIThreshold {
  warning: number;
  critical: number;
  direction: KPIThresholdDirection;
}

/**
 * A KPI is a single aggregated number, optionally a ratio of two
 * aggregations (e.g. total fuel cost / total distance = cost per km).
 * Evaluated fresh on every request/dashboard render by KpiEngine.
 */
export interface KPIDefinition extends BaseEntity {
  name: string;
  description?: string;
  dataSource: DataSourceKey;
  numerator: ReportAggregation;
  denominator?: ReportAggregation;
  filters: ReportFilterCondition[];
  unit?: string; // e.g. '$', 'km', '%'
  threshold?: KPIThreshold;
  targetValue?: number;
}

export interface KPIDefinitionCreateDTO {
  name: string;
  description?: string;
  dataSource: DataSourceKey;
  numerator: ReportAggregation;
  denominator?: ReportAggregation;
  filters?: ReportFilterCondition[];
  unit?: string;
  threshold?: KPIThreshold;
  targetValue?: number;
}

export interface KPIDefinitionUpdateDTO extends Partial<KPIDefinitionCreateDTO> {
  _id: string;
}

export type KPIStatus = 'good' | 'warning' | 'critical' | 'neutral';

export interface KPIEvaluationResult {
  kpiId: string;
  name: string;
  value: number;
  formattedValue: string;
  unit?: string;
  status: KPIStatus;
  targetValue?: number;
  evaluatedAt: Date;
}