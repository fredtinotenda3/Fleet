// server/events/outbox/OutboxPublisher.ts

import { IEventPublisher } from '../base/IEventPublisher';
import { DomainEvent } from '../base/DomainEvent';
import { OutboxRepository } from './OutboxRepository';
import { EventBusFactory } from '../bus/EventBusFactory';
import { OutboxEvent } from './OutboxEvent';

export class OutboxPublisher implements IEventPublisher {
  private repo = new OutboxRepository();
  private bus = EventBusFactory.getInstance();

  async publish(event: DomainEvent): Promise<void> {
    await this.storeEvent(event);
    await this.bus.publish(event);
  }

  private async storeEvent(event: DomainEvent): Promise<void> {
    const tenantId = (event.metadata?.tenantId as string) || 'default';
    const outboxEvent: Omit<OutboxEvent, '_id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt'> = {
      tenantId,
      eventId: event.eventId,
      eventName: event.eventName,
      payload: event.payload,
      metadata: event.metadata,
      processed: false,
      attempts: 0,
    };
    await this.repo.create(outboxEvent, tenantId);
  }
}