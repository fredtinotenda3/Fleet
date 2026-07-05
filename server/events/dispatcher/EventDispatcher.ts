// server/events/registry/EventRegistry.ts

import { IEvent } from '../base/IEvent';
import { IEventHandler } from '../base/IEventHandler';
import { IEventBus } from '../bus/IEventBus';

export class EventDispatcher {
  constructor(private readonly bus: IEventBus) {}

  async dispatch<TEvent extends IEvent>(event: TEvent): Promise<void> {
    await this.bus.publish(event as any);
  }
}