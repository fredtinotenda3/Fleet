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

    // FIX (ðŸ”´ critical -- root cause of "Unexpected error while importing
    // this row" on 100% of rows): individual handler failures were already
    // isolated by executeHandler()'s own try/catch below, but the
    // middleware chain itself (loggingMiddleware / metricsMiddleware /
    // auditMiddleware / retryMiddleware) was NOT wrapped in anything. If
    // any one of those throws -- a metrics backend hiccup, a misconfigured
    // OTEL exporter, a bug in retry logic, anything -- the exception
    // propagates straight out of publish(). Callers like
    // CreateFuelLogHandler invoke publish() as a fire-and-forget side
    // effect AFTER the actual database write has already succeeded, so a
    // throw here doesn't undo the write -- it just makes an already
    // successful operation get reported as failed to the caller (in bulk
    // import's case, EVERY row, since publish() runs once per row and
    // fails identically every time regardless of row content).
    //
    // Event publishing must never be able to fail the operation that
    // triggered it. The whole pipeline (middleware chain + dispatch) is
    // now wrapped so publish() can never reject because of it.
    try {
      await next();
    } catch (error) {
      monitoring.logError(`Event pipeline failed for ${eventName}`, error as Error, {
        eventId: event.eventId,
      });
    }

    // Same rationale: a metrics-reporting failure must never surface as
    // a failure of the domain event itself.
    try {
      const duration = Date.now() - start;
      await monitoring.trackMetric('event.publish.latency', duration, { eventName });
    } catch (error) {
      monitoring.logError(
        `Failed to record event.publish.latency metric for ${eventName}`,
        error as Error,
        { eventId: event.eventId },
      );
    }
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