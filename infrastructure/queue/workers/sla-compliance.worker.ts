// infrastructure/queue/workers/sla-compliance.worker.ts
import { BaseWorker } from '../worker-base.service';
import { JobType } from '../queue.service';
import { QueueName } from '../queue-definitions';
import { slaService } from '@/modules/sla/services/sla.service';
import { complianceService } from '@/modules/compliance/services/compliance.service';
import { backgroundJobScopeService } from '@/server/scheduler/background-job-scope.service';
import { monitoring } from '@/infrastructure/monitoring/logger';

export class SlaComplianceWorker extends BaseWorker {
  constructor() {
    super('cleanup-jobs' as QueueName);
  }

  protected async process(
    jobName: string,
    _payload: unknown,
    _tenantId: string,
    _userId?: string
  ): Promise<void> {
    if (jobName === JobType.PROCESS_SLA_TRACKINGS) {
      await this.processSlaTrackings();
    } else if (jobName === JobType.PROCESS_COMPLIANCE_STATUSES) {
      await this.processComplianceStatuses();
    }
  }

  /**
   * FIX (Phase D -- enterprise organization-aware background
   * processing): both methods below previously ran their own
   * `db.collection('tblorganizations').find({}, { projection: {
   * tenantId: 1 } })` -- the same tenant-enumeration query duplicated,
   * with minor variations, in billing.worker.ts, cleanup.worker.ts, and
   * telemetry.worker.ts. Both now go through BackgroundJobScopeService,
   * the single shared driver for "walk every active organization"
   * background jobs, instead of querying tblorganizations directly. A
   * failure processing one organization's SLA trackings/compliance
   * statuses is caught, audited, and skipped by BackgroundJobScopeService
   * rather than aborting the run for every other organization.
   */
  private async processSlaTrackings(): Promise<void> {
    const summary = await backgroundJobScopeService.forEachOrganization('process-sla-trackings', async (scope) => {
      const result = await slaService.processDueTrackings(scope.organizationId);
      monitoring.logInfo(`[SLA Worker] Processed tenant ${scope.organizationId}`, result as any);
    });
    monitoring.logInfo(
      `[SLA Worker] Run complete: ${summary.organizationsProcessed} processed, ${summary.organizationsSkipped} skipped`
    );
  }

  private async processComplianceStatuses(): Promise<void> {
    const summary = await backgroundJobScopeService.forEachOrganization('process-compliance-statuses', async (scope) => {
      const result = await complianceService.recalculateStatuses(scope.organizationId);
      monitoring.logInfo(`[Compliance Worker] Processed tenant ${scope.organizationId}`, result as any);
    });
    monitoring.logInfo(
      `[Compliance Worker] Run complete: ${summary.organizationsProcessed} processed, ${summary.organizationsSkipped} skipped`
    );
  }
}

export const slaComplianceWorker = new SlaComplianceWorker();