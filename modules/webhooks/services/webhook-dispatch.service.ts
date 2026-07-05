// modules/webhooks/services/webhook-dispatch.service.ts

import { randomUUID } from 'crypto';
import { webhookSubscriptionRepository } from '../repositories/webhook-subscription.repository';
import { webhookDeliveryRepository } from '../repositories/webhook-delivery.repository';
import { webhookSigningService } from './webhook-signing.service';
import { WebhookDeliveryPayload } from '../types/webhook.types';
import { queueService, JobType } from '@/infrastructure/queue/queue.service';
import { monitoring } from '@/infrastructure/monitoring/logger';

/**
 * Resolves subscribers and enqueues one DELIVER_WEBHOOK job per
 * subscriber — called from WebhookDispatchHandler (the event-bus
 * subscriber) rather than performing HTTP delivery itself. Mirrors the
 * shape of WorkflowTriggerService: a thin, failure-isolated fan-out
 * layer that never lets a dispatch failure break the caller's write
 * operation, since this always runs as an event-bus side effect.
 */
export class WebhookDispatchService {
  async dispatch(
    tenantId: string,
    eventName: string,
    eventId: string,
    occurredOn: Date,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (tenantId === 'default' || tenantId === 'system') {
      // Pre-multi-tenancy / system-scoped events have no organization to
      // resolve subscribers against; skip rather than querying with an
      // ambiguous pseudo-tenant.
      return;
    }

    let subscribers;
    try {
      subscribers = await webhookSubscriptionRepository.findActiveSubscribers(tenantId, eventName);
    } catch (error) {
      monitoring.logError('[WebhookDispatch] Failed to resolve subscribers', error as Error, {
        tenantId,
        eventName,
      });
      return;
    }

    if (subscribers.length === 0) return;

    for (const subscription of subscribers) {
      const deliveryId = randomUUID();

      try {
        await webhookDeliveryRepository.create(
          {
            tenantId,
            organizationId: tenantId,
            subscriptionId: subscription._id!,
            eventName,
            deliveryId,
            url: subscription.url,
            requestBody: payload,
            status: 'pending',
            attempt: 1,
          },
          tenantId,
          'system'
        );

        const jobPayload: WebhookDeliveryPayload = {
          deliveryId,
          subscriptionId: subscription._id!,
          url: subscription.url,
          secret: subscription.secret,
          eventName,
          eventId,
          occurredOn,
          payload,
          organizationId: tenantId,
        };

        await queueService.addJob(JobType.DELIVER_WEBHOOK, {
          type: JobType.DELIVER_WEBHOOK,
          payload: jobPayload,
          tenantId,
        });
      } catch (error) {
        monitoring.logError('[WebhookDispatch] Failed to queue delivery', error as Error, {
          tenantId,
          eventName,
          subscriptionId: subscription._id,
        });
      }
    }
  }

  /**
   * Fires a synthetic test delivery for a subscription (the "Send Test
   * Event" button in an admin UI) without requiring a real domain event
   * to occur. Bypasses the WebhookDeliveryLog pre-creation step's normal
   * event-name validation since this path always uses a fixed
   * `webhook.test` pseudo-event.
   */
  async sendTest(subscriptionId: string, tenantId: string): Promise<{ deliveryId: string }> {
    const subscription = await webhookSubscriptionRepository.findById(subscriptionId, tenantId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const deliveryId = randomUUID();
    const testPayload = {
      message: 'This is a test delivery from the Fleet platform webhook system.',
      triggeredAt: new Date().toISOString(),
    };

    await webhookDeliveryRepository.create(
      {
        tenantId,
        organizationId: tenantId,
        subscriptionId,
        eventName: 'webhook.test',
        deliveryId,
        url: subscription.url,
        requestBody: testPayload,
        status: 'pending',
        attempt: 1,
      },
      tenantId,
      'system'
    );

    const jobPayload: WebhookDeliveryPayload = {
      deliveryId,
      subscriptionId,
      url: subscription.url,
      secret: subscription.secret,
      eventName: 'webhook.test',
      eventId: randomUUID(),
      occurredOn: new Date(),
      payload: testPayload,
      organizationId: tenantId,
    };

    await queueService.addJob(JobType.DELIVER_WEBHOOK, {
      type: JobType.DELIVER_WEBHOOK,
      payload: jobPayload,
      tenantId,
    });

    return { deliveryId };
  }
}

export const webhookDispatchService = new WebhookDispatchService();