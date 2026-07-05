import { IEventHandler } from '@/server/events/base/IEventHandler';
import { DomainEvent } from '@/server/events/base/DomainEvent';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { queueService } from '@/infrastructure/queue/queue.service';

/**
 * Fans an ObservabilityAlertTriggered event out to:
 *  1. the immutable audit ledger (category 'system'), so alerts are
 *     queryable in the same admin UI as every other security/system event;
 *  2. an outbound webhook (Slack/PagerDuty/Opsgenie-compatible payload) if
 *     ALERT_WEBHOOK_URL is set, delivered through the existing
 *     DELIVER_WEBHOOK queue so a flaky alerting endpoint gets the same
 *     retry/backoff/dead-letter handling as any other webhook.
 */
export class AlertNotificationHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const payload = event.payload;
    const severity = payload.severity === 'critical' ? 'critical' : 'warning';

    await auditLog.log({
      action: 'OBSERVABILITY_ALERT_TRIGGERED',
      userId: 'system',
      tenantId: 'system',
      entityType: 'alert',
      category: 'system',
      severity,
      metadata: payload,
    });

    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (!webhookUrl) return;

    await queueService
      .addWebhookJob(
        {
          url: webhookUrl,
          event: 'observability.alert',
          payload: {
            text: `[${String(severity).toUpperCase()}] ${payload.message}`,
            metric: payload.metric,
            value: payload.value,
            threshold: payload.threshold,
            labels: payload.labels,
            occurredAt: event.occurredOn,
          },
        },
        'system'
      )
      .catch(() => undefined);
  }
}