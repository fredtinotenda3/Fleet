// server/events/middleware/RetryMiddleware.ts

import { IEvent } from '../base/IEvent';
import { monitoring } from '@/infrastructure/monitoring/logger';

export async function retryMiddleware(
  event: IEvent,
  next: () => Promise<void>,
): Promise<void> {
  const maxRetries = 3;
  let attempt = 0;
  let lastError: Error | undefined;

  while (attempt < maxRetries) {
    try {
      await next();
      return;
    } catch (error) {
      lastError = error as Error;
      attempt++;
      const delay = Math.pow(2, attempt) * 100;
      monitoring.logWarn(`Retry attempt ${attempt} for event ${event.eventName}`, {
        eventId: event.eventId,
        delay,
        error: lastError.message,
      });
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  monitoring.logError(
    `Event processing failed after ${maxRetries} retries: ${event.eventName}`,
    lastError!,
    { eventId: event.eventId },
  );
}