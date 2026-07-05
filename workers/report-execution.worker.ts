
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
        payload.tenantId
      );
      return;
    }

    throw new Error(`Unknown export-data job kind: ${(payload as ExportDataPayload).kind}`);
  }
}

export const reportExecutionWorker = new ReportExecutionWorker();