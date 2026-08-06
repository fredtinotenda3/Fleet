// workers/report.worker.ts

import { BaseWorker } from '@/infrastructure/queue/worker-base.service';
import { reportExecutionService } from '@/modules/reporting/services/report-execution.service';
import { JobType } from '@/infrastructure/queue/queue.service';

/**
 * FIX (broken worker — imported a module that does not exist).
 *
 * This worker was written against `@/modules/reports/services/report.service`
 * exposing `generateReport(config, tenantId, userId)` and
 * `executeGeneration(reportId, config, tenantId, userId)`. Neither the
 * module nor those signatures exist anywhere in the codebase — the real
 * module is `modules/reporting` and the real entry point is
 * `reportExecutionService.executeGeneration(executionId, tenantId, userId)`.
 *
 * Because next.config.ts set `ignoreBuildErrors: true`, this never
 * surfaced at build time; the worker would simply have thrown
 * MODULE_NOT_FOUND on first execution, so queued report jobs were never
 * actually processed.
 *
 * Rewritten against the real contract. ReportExecutionService enqueues
 * `JobType.EXPORT_DATA` with payload `{ kind: 'execution', executionId }`
 * (see its createExecution path), so that is exactly what this consumes.
 */
interface ReportExecutionJobPayload {
  kind?: string;
  executionId?: string;
}

export class ReportWorker extends BaseWorker<ReportExecutionJobPayload> {
  constructor() {
    super(JobType.EXPORT_DATA);
  }

  protected async process(
    _jobName: string,
    payload: ReportExecutionJobPayload,
    tenantId: string,
    userId?: string
  ): Promise<void> {
    // The EXPORT_DATA queue carries more than one kind of job; ignore
    // anything that is not a report execution rather than failing it,
    // so unrelated export jobs are left for their own consumer.
    if (payload?.kind !== 'execution') return;

    const { executionId } = payload;
    if (!executionId) {
      throw new Error(
        'Report execution job is missing executionId; refusing to run an unscoped generation.'
      );
    }

    // tenantId comes from the job envelope, which the enqueueing service
    // stamps from the requesting user's resolved tenant. It is passed
    // straight through so the generation is scoped to the same tenant
    // that requested it — never widened.
    await reportExecutionService.executeGeneration(executionId, tenantId, userId ?? 'system');
  }
}
