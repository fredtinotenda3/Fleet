
// modules/reporting/services/report-delivery.service.ts

import { emailService } from '@/infrastructure/email/email.service';
import { ReportExecution } from '../types/report-execution.types';
import { monitoring } from '@/infrastructure/monitoring/logger';

/**
 * Delivers a completed ReportExecution by email as a signed download link
 * rather than a raw attachment — EmailService's SMTP wrapper doesn't
 * support attachments, and generated reports can exceed typical SMTP
 * attachment-size limits anyway, so a link is both simpler and safer.
 * Per-recipient failures are logged and swallowed so one bad address
 * never fails the whole delivery fan-out.
 */
export class ReportDeliveryService {
  async deliver(execution: ReportExecution, tenantId: string): Promise<void> {
    if (!execution.emailedTo?.length || !execution.fileUrl) return;

    const subject = `Your report is ready: ${execution.name}`;
    const html = `
      <p>Your report <strong>${execution.name}</strong> has been generated.</p>
      <p><a href="${execution.fileUrl}">Download the report (${execution.format.toUpperCase()})</a></p>
      <p style="color:#888;font-size:12px;">Sign in to the platform to regenerate this link if it has expired.</p>
    `;
    const text = `Your report "${execution.name}" is ready: ${execution.fileUrl}`;

    for (const recipient of execution.emailedTo) {
      try {
        await emailService.send({ to: recipient, subject, html, text });
      } catch (error) {
        monitoring.logError(`[ReportDelivery] Failed to email report to ${recipient}`, error as Error, {
          tenantId,
          executionId: execution._id,
        });
      }
    }
  }
}

export const reportDeliveryService = new ReportDeliveryService();