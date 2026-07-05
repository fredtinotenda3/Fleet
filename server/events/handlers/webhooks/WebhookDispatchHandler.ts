// server/events/handlers/webhooks/WebhookDispatchHandler.ts

import { IEventHandler } from '../../base/IEventHandler';
import { DomainEvent } from '../../base/DomainEvent';
import { webhookDispatchService } from '@/modules/webhooks/services/webhook-dispatch.service';

/**
 * Subscribed onto every domain event name in server/events/bootstrap.ts
 * alongside WorkflowTriggerHandler/NotificationHandler/AnalyticsHandler/
 * etc. Resolves the tenant from event metadata (falling back to the
 * event payload's own tenantId field, matching the pattern every other
 * handler in this directory already uses) and delegates to
 * WebhookDispatchService, which fans the event out to every matching
 * active subscription.
 */
export class WebhookDispatchHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const tenantId =
      (event.metadata?.tenantId as string) ||
      (event.payload?.tenantId as string) ||
      'default';

    await webhookDispatchService.dispatch(
      tenantId,
      event.eventName,
      event.eventId,
      event.occurredOn,
      event.payload
    );
  }
}