// workers/billing.worker.ts

import { BaseWorker } from '@/infrastructure/queue/worker-base.service';
import { billingService } from '@/modules/billing/services/billing.service';
import { invoiceRepository } from '@/modules/billing/repositories/invoice.repository';
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
      // Scans every tenant's pending invoices and re-checks status via
      // Paynow's poll URL, catching any webhook that never arrived.
      const db = await (await import('@/infrastructure/database/mongodb')).default();
      const orgs = await db.collection('tblorganizations').find({ isDeleted: { $ne: true }, status: 'active' }).project({ tenantId: 1 }).toArray();

      for (const org of orgs) {
        const pending = await invoiceRepository.findPendingByOrganization('', org.tenantId);
        for (const invoice of pending) {
          try {
            await billingService.checkInvoiceStatus(invoice._id!, invoice.tenantId);
          } catch (error) {
            monitoring.logError(`[BillingWorker] Failed polling invoice ${invoice._id}`, error as Error);
          }
        }
      }
    }
  }
}