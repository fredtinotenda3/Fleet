// modules/webhooks/events/WebhookSubscriptionCreatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { WEBHOOK_SUBSCRIPTION_CREATED } from './event-names';
import { WebhookSubscription } from '../types/webhook.types';

export class WebhookSubscriptionCreatedEvent extends DomainEvent {
  constructor(subscription: WebhookSubscription, metadata?: Record<string, unknown>) {
    super(WEBHOOK_SUBSCRIPTION_CREATED, {
      entityId: subscription._id,
      entityType: 'webhook_subscription',
      name: subscription.name,
      url: subscription.url,
      events: subscription.events,
      tenantId: subscription.organizationId,
    }, metadata);
  }
}