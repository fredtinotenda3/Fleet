// server/events/publishers/VehicleEventPublisher.ts

import { IEventPublisher } from '../base/IEventPublisher';
import { DomainEvent } from '../base/DomainEvent';
import { EventBusFactory } from '../bus/EventBusFactory';

export class VehicleEventPublisher implements IEventPublisher {
  private bus = EventBusFactory.getInstance();

  async publish(event: DomainEvent): Promise<void> {
    await this.bus.publish(event);
  }
}