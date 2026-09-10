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
  /**
   * The requester's org-unit scope, frozen at request time.
   *
   * ---------------------------------------------------------------
   * WHY THIS IS PERSISTED RATHER THAN PASSED
   * ---------------------------------------------------------------
   * The controller resolves a full `TenantContext` and hands it to
   * `generate()`, but generation happens LATER, in a BullMQ worker, in
   * another process. A TenantContext cannot cross that boundary -- and
   * because the worker had nothing to pass, the query engine received
   * `undefined` and its `if (!context) return {}` made every export
   * ORGANIZATION-WIDE. A branch manager's on-screen report was scoped
   * and the file they downloaded from it was not.
   *
   * The context cannot be serialised, but the SCOPE DECISION can. This
   * field carries it verbatim, with the same three-state meaning used
   * everywhere else in the platform:
   *
   *   null       org-wide (the caller may see every unit)
   *   []         fail-closed (matches nothing)
   *   [ids...]   narrowed to these units
   *
   * `undefined` -- a record written before this field existed -- is
   * treated as fail-closed by the worker, NOT as org-wide. A pending
   * execution lives for seconds, so the cost is a re-run; the
   * alternative is preserving the leak for exactly the rows already in
   * flight.
   */
  requestedOrgUnitIds?: string[] | null;
}

export interface GenerateExecutionInput {
  reportDefinitionId?: string;
  dashboardId?: string;
  format: ExecutionFormat;
  drilldownFilters?: ReportFilterCondition[];
  emailTo?: string[];
}