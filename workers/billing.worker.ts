// workers/billing.worker.ts

import { BaseWorker } from '@/infrastructure/queue/worker-base.service';
import { billingService } from '@/modules/billing/services/billing.service';
import { invoiceRepository } from '@/modules/billing/repositories/invoice.repository';
import { backgroundJobScopeService } from '@/server/scheduler/background-job-scope.service';
import { monitoring } from '@/infrastructure/monitoring/logger';

/**
 * Two responsibilities, both on the CRITICAL-priority 'billing-jobs'
 * queue since money is involved: expiring stale pending invoices
 * (recurring), and polling Paynow for any pending invoice whose
 * result-URL webhook may have been missed (recurring, defensive
 * backstop to the primary webhook flow in
 * app/api/billing/webhook/route.ts).
 */
export class BillingWorker extends BaseWorker<Record<string, never>> {
  constructor(queueName: 'billing-jobs') {
    super(queueName);
  }

  protected async process(jobName: string): Promise<void> {
    if (jobName === 'expire-invoices') {
      const count = await billingService.expireStaleInvoices();
      if (count > 0) monitoring.logInfo(`[BillingWorker] Expired ${count} stale invoice(s)`);
      return;
    }

    if (jobName === 'poll-pending-payments') {
      /**
       * FIX (Phase D -- enterprise organization-aware background
       * processing): this previously hand-rolled its own
       * `db.collection('tblorganizations').find(...)` scan, duplicating
       * the same tenant-enumeration logic re-implemented separately in
       * cleanup.worker.ts, telemetry.worker.ts, and
       * sla-compliance.worker.ts. Now goes through
       * BackgroundJobScopeService, the single shared driver for
       * "walk every active organization" jobs. A failure for one
       * organization (e.g. Paynow being unreachable for that tenant's
       * configured account) is caught, audited, and skipped by
       * BackgroundJobScopeService rather than aborting the poll for
       * every other organization.
       */
      await backgroundJobScopeService.forEachOrganization('poll-pending-payments', async (scope) => {
        const pending = await invoiceRepository.findPendingByOrganization('', scope.organizationId);
        for (const invoice of pending) {
          try {
            await billingService.checkInvoiceStatus(invoice._id!, invoice.tenantId);
          } catch (error) {
            monitoring.logError(`[BillingWorker] Failed polling invoice ${invoice._id}`, error as Error);
          }
        }
      });
    }
  }
}