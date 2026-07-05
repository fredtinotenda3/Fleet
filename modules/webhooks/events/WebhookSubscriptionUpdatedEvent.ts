// modules/webhooks/events/WebhookSubscriptionUpdatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { WEBHOOK_SUBSCRIPTION_UPDATED } from './event-names';
import { WebhookSubscription, WebhookSubscriptionUpdateDTO } from '../types/webhook.types';

export class WebhookSubscriptionUpdatedEvent extends DomainEvent {
  constructor(
    subscription: WebhookSubscription,
    changes: WebhookSubscriptionUpdateDTO,
    metadata?: Record<string, unknown>
  ) {
    super(WEBHOOK_SUBSCRIPTION_UPDATED, {
      entityId: subscription._id,
      entityType: 'webhook_subscription',
      name: subscription.name,
      status: subscription.status,
      changes,
      tenantId: subscription.organizationId,
    }, metadata);
  }
}