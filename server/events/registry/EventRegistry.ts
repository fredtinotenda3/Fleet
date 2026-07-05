// server/events/registry/EventRegistry.ts

import { IEventHandler } from '../base/IEventHandler';
import { IEvent } from '../base/IEvent';

export class EventRegistry {
  private handlers = new Map<string, Set<IEventHandler<any>>>();

  register<TEvent extends IEvent>(
    eventName: string,
    handler: IEventHandler<TEvent>,
  ): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, new Set());
    }
    this.handlers.get(eventName)!.add(handler);
  }

  getHandlers(eventName: string): IEventHandler[] {
    return Array.from(this.handlers.get(eventName) || []);
  }

  clear(): void {
    this.handlers.clear();
  }
}