// infrastructure/queue/workers/sla-compliance.worker.ts
import { BaseWorker } from '../worker-base.service';
import { JobType } from '../queue.service';
import { QueueName } from '../queue-definitions';
import { slaService } from '@/modules/sla/services/sla.service';
import { complianceService } from '@/modules/compliance/services/compliance.service';
import connectToDatabase from '@/infrastructure/database/mongodb';
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

  private async processSlaTrackings(): Promise<void> {
    const db = await connectToDatabase();
    const tenants = await db.collection('tblorganizations').find({}, { projection: { tenantId: 1 } }).toArray();

    for (const tenant of tenants) {
      const tenantId = tenant.tenantId || tenant._id.toString();
      try {
        const result = await slaService.processDueTrackings(tenantId);
        monitoring.logInfo(`[SLA Worker] Processed tenant ${tenantId}`, result);
      } catch (error) {
        monitoring.logError(`[SLA Worker] Failed for tenant ${tenantId}`, error as Error);
      }
    }
  }

  private async processComplianceStatuses(): Promise<void> {
    const db = await connectToDatabase();
    const tenants = await db.collection('tblorganizations').find({}, { projection: { tenantId: 1 } }).toArray();

    for (const tenant of tenants) {
      const tenantId = tenant.tenantId || tenant._id.toString();
      try {
        const result = await complianceService.recalculateStatuses(tenantId);
        monitoring.logInfo(`[Compliance Worker] Processed tenant ${tenantId}`, result);
      } catch (error) {
        monitoring.logError(`[Compliance Worker] Failed for tenant ${tenantId}`, error as Error);
      }
    }
  }
}

export const slaComplianceWorker = new SlaComplianceWorker();