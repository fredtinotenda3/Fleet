// workers/webhook.worker.ts

import { BaseWorker } from '@/infrastructure/queue/worker-base.service';
import { webhookDeliveryRepository } from '@/modules/webhooks/repositories/webhook-delivery.repository';
import { webhookSubscriptionRepository } from '@/modules/webhooks/repositories/webhook-subscription.repository';
import { webhookSigningService } from '@/modules/webhooks/services/webhook-signing.service';
import { WebhookDeliveryPayload } from '@/modules/webhooks/types/webhook.types';
import { monitoring } from '@/infrastructure/monitoring/logger';

const DELIVERY_TIMEOUT_MS = 10_000;

/**
 * Delivers a single webhook payload over HTTP, signs it, records the
 * outcome in WebhookDeliveryLog, updates the subscription's rolling
 * success/failure counters, and auto-disables subscriptions that have
 * failed too many times in a row. Throwing here (on a non-2xx response
 * or a network failure) lets BaseWorker's BullMQ retry/backoff take
 * over automatically — this worker only needs to handle a single
 * attempt correctly, not implement its own retry loop.
 *
 * This is deliberately a distinct worker file from the generic
 * DELIVER_WEBHOOK usage in modules/billing (Paynow) or plugin webhooks —
 * both share the same `deliver-webhook` BullMQ queue/JobType, so this
 * worker's `process()` must stay generic enough to handle any
 * `WebhookDeliveryPayload`-shaped job, not just event-subscription
 * deliveries. If a future payload shape needs different handling,
 * branch on a `kind` discriminator field rather than adding a second
 * queue.
 */
class WebhookWorker extends BaseWorker<WebhookDeliveryPayload> {
  constructor() {
    super('deliver-webhook');
  }

  protected async process(
    _jobName: string,
    payload: WebhookDeliveryPayload,
    tenantId: string
  ): Promise<void> {
    const { deliveryId, subscriptionId, url, secret, eventName, eventId, occurredOn } = payload;

    const deliveryLog = await webhookDeliveryRepository.findByDeliveryId(deliveryId, tenantId);

    const body = JSON.stringify({
      id: eventId,
      event: eventName,
      occurredOn,
      data: payload.payload,
    });

    const signature = webhookSigningService.buildSignatureHeader(body, secret);
    const start = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Fleet-Signature': signature,
            'X-Fleet-Event': eventName,
            'X-Fleet-Delivery-Id': deliveryId,
            'User-Agent': 'Fleet-Webhooks/1.0',
          },
          body,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      const latencyMs = Date.now() - start;
      const responseBody = await response.text().catch(() => '');
      const success = response.status >= 200 && response.status < 300;

      if (deliveryLog) {
        await webhookDeliveryRepository.markOutcome(deliveryLog._id!, tenantId, {
          status: success ? 'success' : 'failed',
          responseStatusCode: response.status,
          responseBody: responseBody.slice(0, 2000),
          latencyMs,
          error: success ? undefined : `HTTP ${response.status}`,
        });
      }

      await webhookSubscriptionRepository.recordDeliveryOutcome(subscriptionId, tenantId, success);

      if (!success) {
        await webhookSubscriptionRepository.autoDisableIfExcessiveFailures(subscriptionId, tenantId);
        throw new Error(`Webhook delivery failed with HTTP ${response.status}`);
      }
    } catch (error) {
      const latencyMs = Date.now() - start;
      const message = error instanceof Error ? error.message : 'Unknown delivery error';

      if (deliveryLog) {
        await webhookDeliveryRepository.markOutcome(deliveryLog._id!, tenantId, {
          status: 'failed',
          latencyMs,
          error: message,
        });
      }

      await webhookSubscriptionRepository.recordDeliveryOutcome(subscriptionId, tenantId, false);
      await webhookSubscriptionRepository.autoDisableIfExcessiveFailures(subscriptionId, tenantId);

      monitoring.logWarn(`[WebhookWorker] Delivery attempt failed for subscription ${subscriptionId}`, {
        eventName,
        deliveryId,
        error: message,
      });

      // Re-throw so BullMQ's attempts/backoff (configured in
      // QUEUE_DEFINITIONS['deliver-webhook']) actually retries this job;
      // swallowing the error here would silently stop after one attempt.
      throw error;
    }
  }
}

export const webhookWorker = new WebhookWorker();