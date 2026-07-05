// modules/webhooks/events/WebhookSubscriptionDeletedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { WEBHOOK_SUBSCRIPTION_DELETED } from './event-names';

export class WebhookSubscriptionDeletedEvent extends DomainEvent {
  constructor(
    subscriptionId: string,
    name: string,
    tenantId: string,
    metadata?: Record<string, unknown>
  ) {
    super(WEBHOOK_SUBSCRIPTION_DELETED, {
      entityId: subscriptionId,
      entityType: 'webhook_subscription',
      name,
      tenantId,
    }, metadata);
  }
}