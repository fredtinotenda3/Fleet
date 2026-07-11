// modules/reporting/types/report-execution.types.ts

import { BaseEntity } from '@/shared/types/common.types';
import { ReportFilterCondition } from './report-definition.types';

// NOTE: report-execution.service.ts's EXTENSION_MAP/MIME_MAP map 'word' to
// legacy extension 'doc' / mime 'application/msword', but any practical
// generator (including the `docx` package used in word-report.generator.ts
// below) produces modern OOXML .docx. Flagging -- not changing that file.
export type ExecutionFormat = 'pdf' | 'excel' | 'csv' | 'word' | 'json';
export type ExecutionStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type ExecutionSourceType = 'report_definition' | 'dashboard';

export interface ReportExecution extends BaseEntity {
  name: string;
  sourceType: ExecutionSourceType;
  reportDefinitionId?: string;
  dashboardId?: string;
  format: ExecutionFormat;
  status: ExecutionStatus;
  generatedBy: string;
  generatedAt: Date;
  drilldownFilters?: ReportFilterCondition[];
  emailedTo?: string[];
  fileUrl?: string;
  fileKey?: string;
  fileSize?: number;
  errorMessage?: string;
  downloadCount: number;
  isScheduledRun?: boolean;
}

export interface GenerateExecutionInput {
  reportDefinitionId?: string;
  dashboardId?: string;
  format: ExecutionFormat;
  drilldownFilters?: ReportFilterCondition[];
  emailTo?: string[];
}