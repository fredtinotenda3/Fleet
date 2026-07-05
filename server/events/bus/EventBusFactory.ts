// server/events/bus/EventBusFactory.ts

import { IEventBus } from './IEventBus';
import { InMemoryEventBus } from './InMemoryEventBus';

let instance: IEventBus | null = null;

export class EventBusFactory {
  static getInstance(): IEventBus {
    if (!instance) {
      instance = new InMemoryEventBus();
    }
    return instance;
  }

  static reset(): void {
    instance = null;
  }
}