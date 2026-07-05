// workers/report.worker.ts

import { BaseWorker } from '@/infrastructure/queue/worker-base.service';
import { reportService } from '@/modules/reports/services/report.service';
import { ReportConfig } from '@/modules/reports/types/report.types';

interface GenerateReportPayload {
  config: ReportConfig;
  reportId?: string;
}

/**
 * Closes the gap flagged in modules/reports/services/report.service.ts's
 * own comments: GENERATE_REPORT jobs were queued (both from
 * generateReport() and scheduleReport()'s cron repeat) but nothing ever
 * consumed them. This worker calls the same executeGeneration() method
 * the report service already exposes for exactly this purpose.
 * Scheduled (recurring) reports arrive without a pre-created `reportId`
 * â€” the report record is created fresh on each run.
 */
export class ReportWorker extends BaseWorker<GenerateReportPayload> {
  constructor() {
    super('generate-report');
  }

  protected async process(_jobName: string, payload: GenerateReportPayload, tenantId: string, userId?: string): Promise<void> {
    let reportId = payload.reportId;

    if (!reportId) {
      const created = await reportService.generateReport(payload.config, tenantId, userId || 'system');
      reportId = created._id!;
      // generateReport() itself re-enqueues a GENERATE_REPORT job with
      // this reportId set, so this invocation is done; the follow-up
      // job (with reportId present) does the actual generation below.
      return;
    }

    await reportService.executeGeneration(reportId, payload.config, tenantId, userId || 'system');
  }
}