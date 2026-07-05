// server/events/middleware/LoggingMiddleware.ts

import { IEvent } from '../base/IEvent';
import { monitoring } from '@/infrastructure/monitoring/logger';

export async function loggingMiddleware(
  event: IEvent,
  next: () => Promise<void>,
): Promise<void> {
  monitoring.logDebug(`Event published: ${event.eventName}`, {
    eventId: event.eventId,
    occurredOn: event.occurredOn,
  });
  await next();
}