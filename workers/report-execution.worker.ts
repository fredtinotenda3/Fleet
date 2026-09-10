
// workers/report-execution.worker.ts

import { BaseWorker } from '@/infrastructure/queue/worker-base.service';
import { reportExecutionService } from '@/modules/reporting/services/report-execution.service';
import { ExecutionFormat } from '@/modules/reporting/types/report-execution.types';

interface ExportDataPayload {
  kind: 'execution' | 'scheduled';
  executionId?: string;
  reportDefinitionId?: string;
  format?: ExecutionFormat;
  recipients?: string[];
  tenantId?: string;
  /**
   * The org-unit scope of the user who CREATED the schedule, frozen
   * onto the payload (kind: 'scheduled' only).
   *
   * A TenantContext cannot cross a queue boundary, and without this the
   * query engine received `undefined` and ran the export
   * ORGANIZATION-WIDE -- on a path whose output is emailed to a
   * recipient list. `null` means the creator was genuinely org-wide;
   * `undefined` (a schedule created before this field existed) is
   * treated as fail-closed downstream, never as org-wide.
   */
  orgUnitIds?: string[] | null;
}

/**
 * Consumes the 'export-data' queue (JobType.EXPORT_DATA) — previously
 * defined but unconsumed — for the Enterprise Reporting Platform. Two
 * payload shapes:
 *
 *  - kind: 'execution' — ad-hoc report/dashboard export requested via
 *    ReportExecutionService.generate(). Uses the job's own tenantId.
 *  - kind: 'scheduled' — recurring run driven by CronEngineService via
 *    ReportSchedulerService's per-definition repeatable job. Carries its
 *    own `tenantId` in the payload since ScheduledJob rows are always
 *    stored under the pseudo-tenant 'system' (see
 *    server/scheduler/cron-engine.service.ts), so the job's outer
 *    tenantId param cannot be trusted here.
 */
export class ReportExecutionWorker extends BaseWorker<ExportDataPayload> {
  constructor() {
    super('export-data');
  }

  protected async process(_jobName: string, payload: ExportDataPayload, tenantId: string, userId?: string): Promise<void> {
    if (payload.kind === 'execution') {
      if (!payload.executionId) throw new Error('export-data execution job missing executionId');
      await reportExecutionService.executeGeneration(payload.executionId, tenantId, userId || 'system');
      return;
    }

    if (payload.kind === 'scheduled') {
      if (!payload.reportDefinitionId || !payload.format || !payload.tenantId) {
        throw new Error('export-data scheduled job missing reportDefinitionId/format/tenantId');
      }
      await reportExecutionService.generateScheduled(
        payload.reportDefinitionId,
        payload.format,
        payload.recipients ?? [],
        payload.tenantId,
        // Explicitly forwarded. `undefined` here is NOT the same as
        // `null`: generateScheduled fails closed on the former.
        payload.orgUnitIds
      );
      return;
    }

    throw new Error(`Unknown export-data job kind: ${(payload as ExportDataPayload).kind}`);
  }
}

export const reportExecutionWorker = new ReportExecutionWorker();