// server/events/outbox/OutboxProcessor.ts

import { OutboxRepository } from './OutboxRepository';
import { EventBusFactory } from '../bus/EventBusFactory';
import { DomainEvent } from '../base/DomainEvent';
import { monitoring } from '@/infrastructure/monitoring/logger';

export class OutboxProcessor {
  private repo = new OutboxRepository();
  private bus = EventBusFactory.getInstance();
  private isRunning = false;

  async start(intervalMs: number = 5000): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    while (this.isRunning) {
      try {
        await this.processBatch();
      } catch (error) {
        monitoring.logError('Outbox processor error', error as Error);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  stop(): void {
    this.isRunning = false;
  }

  private async processBatch(): Promise<void> {
    const events = await this.repo.getUnprocessedEvents('default', 100);
    if (events.length === 0) return;

    for (const outboxEvent of events) {
      try {
        const event = new (class extends DomainEvent {
          constructor() {
            super(outboxEvent.eventName, outboxEvent.payload, outboxEvent.metadata);
            (this as any).eventId = outboxEvent.eventId;
            (this as any).occurredOn = new Date(outboxEvent.createdAt!);
          }
        })();

        await this.bus.publish(event);
        await this.repo.markAsProcessed(outboxEvent._id!, outboxEvent.tenantId);
      } catch (error) {
        await this.repo.incrementAttempts(
          outboxEvent._id!,
          outboxEvent.tenantId,
          (error as Error).message,
        );
        monitoring.logError(
          `Failed to process outbox event ${outboxEvent.eventId}`,
          error as Error,
        );
      }
    }
  }
}