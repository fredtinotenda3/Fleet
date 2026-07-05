// modules/reporting/types/report-execution.types.ts

import { BaseEntity } from '@/shared/types/common.types';
import { ReportFilterCondition } from './report-definition.types';

export type ExecutionFormat = 'pdf' | 'excel' | 'csv' | 'word' | 'json';
export type ExecutionStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type ExecutionSourceType = 'report_definition' | 'dashboard';

/**
 * A single generated artifact — either an ad-hoc run, a scheduled run, or
 * a dashboard export. Mirrors the shape of the pre-existing
 * modules/reports Report entity but generalized to cover dashboards and
 * the extra formats (word) this phase adds; modules/reports remains the
 * legacy fleet-summary-only generator and is unaffected.
 */
export interface ReportExecution extends BaseEntity {
  name: string;
  sourceType: ExecutionSourceType;
  reportDefinitionId?: string;
  dashboardId?: string;
  format: ExecutionFormat;
  status: ExecutionStatus;
  fileUrl?: string;
  fileKey?: string;
  fileSize?: number;
  generatedBy: string;
  generatedAt: Date;
  drilldownFilters?: ReportFilterCondition[];
  emailedTo?: string[];
  downloadCount: number;
  errorMessage?: string;
  isScheduledRun?: boolean;
}

export interface GenerateExecutionInput {
  reportDefinitionId?: string;
  dashboardId?: string;
  format: ExecutionFormat;
  drilldownFilters?: ReportFilterCondition[];
  emailTo?: string[];
}