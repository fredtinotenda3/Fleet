// modules/reporting/types/kpi.types.ts

import { BaseEntity } from '@/shared/types/common.types';
import { DataSourceKey } from './data-source.types';
import { ReportFilterCondition, ReportAggregation } from './report-definition.types';

export type KPIStatus = 'good' | 'warning' | 'critical' | 'neutral';

export interface KPIThreshold {
  warning: number;
  critical: number;
  // Matches kpi.engine.ts's resolveStatus(): for 'higher_is_better', value <= critical
  // is critical, value <= warning is warning, else good. Inverted for 'lower_is_better'.
  direction: 'higher_is_better' | 'lower_is_better';
}

export interface KPIDefinition extends BaseEntity {
  name: string;
  description?: string;
  dataSource: DataSourceKey;
  numerator: ReportAggregation;
  denominator?: ReportAggregation;
  filters: ReportFilterCondition[];
  unit?: string;
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
  _id?: string;
}

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