// server/events/middleware/ValidationMiddleware.ts

import { IEvent } from '../base/IEvent';
import { monitoring } from '@/infrastructure/monitoring/logger';
import { ZodSchema } from 'zod';

export function createValidationMiddleware<TEvent extends IEvent>(
  schema: ZodSchema<TEvent['payload']>,
) {
  return async (event: IEvent, next: () => Promise<void>): Promise<void> => {
    try {
      schema.parse(event.payload);
    } catch (error) {
      monitoring.logError(
        `Event validation failed for ${event.eventName}`,
        error as Error,
        { eventId: event.eventId, payload: event.payload },
      );
      throw error;
    }
    await next();
  };
}