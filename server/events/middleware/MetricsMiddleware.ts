// server/events/middleware/MetricsMiddleware.ts

import { IEvent } from '../base/IEvent';
import { monitoring } from '@/infrastructure/monitoring/logger';

export async function metricsMiddleware(
  event: IEvent,
  next: () => Promise<void>,
): Promise<void> {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  await monitoring.trackMetric('event.processing.duration', duration, {
    eventName: event.eventName,
  });
}