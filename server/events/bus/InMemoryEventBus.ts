// server/events/bus/InMemoryEventBus.ts

import { IEventBus } from './IEventBus';
import { IEventHandler } from '../base/IEventHandler';
import { DomainEvent } from '../base/DomainEvent';
import { IEvent } from '../base/IEvent';
import { monitoring } from '@/infrastructure/monitoring/logger';

type MiddlewareFn = (event: IEvent, next: () => Promise<void>) => Promise<void>;

export class InMemoryEventBus implements IEventBus {
  private handlers = new Map<string, Set<IEventHandler<any>>>();
  private middleware: MiddlewareFn[] = [];

  public subscribe<TEvent extends IEvent>(
    eventName: string,
    handler: IEventHandler<TEvent>,
  ): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, new Set());
    }
    this.handlers.get(eventName)!.add(handler);
  }

  public unsubscribe<TEvent extends IEvent>(
    eventName: string,
    handler: IEventHandler<TEvent>,
  ): void {
    const handlers = this.handlers.get(eventName);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(eventName);
      }
    }
  }

  public use(middleware: MiddlewareFn): void {
    this.middleware.push(middleware);
  }

  public async publish(event: DomainEvent): Promise<void> {
    const start = Date.now();
    const eventName = event.eventName;

    const dispatch = async () => {
      const handlers = this.handlers.get(eventName) || new Set();
      if (handlers.size === 0) {
        monitoring.logDebug(`No handlers for event ${eventName}`, { eventId: event.eventId });
        return;
      }

      const promises = Array.from(handlers).map((handler) =>
        this.executeHandler(handler, event, eventName),
      );
      await Promise.all(promises);
    };

    let idx = 0;
    const next = async (): Promise<void> => {
      if (idx < this.middleware.length) {
        const mw = this.middleware[idx++];
        await mw(event, next);
      } else {
        await dispatch();
      }
    };

    await next();

    const duration = Date.now() - start;
    await monitoring.trackMetric('event.publish.latency', duration, { eventName });
  }

  private async executeHandler(
    handler: IEventHandler,
    event: DomainEvent,
    eventName: string,
  ): Promise<void> {
    try {
      await handler.handle(event);
    } catch (error) {
      monitoring.logError(`Handler failed for event ${eventName}`, error as Error, {
        eventId: event.eventId,
        handlerName: handler.constructor.name,
      });
    }
  }
}