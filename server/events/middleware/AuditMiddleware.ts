// server/events/middleware/AuditMiddleware.ts

import { IEvent } from '../base/IEvent';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

export async function auditMiddleware(
  event: IEvent,
  next: () => Promise<void>,
): Promise<void> {
  const payload = event.payload;
  await auditLog.log({
    action: `EVENT_${event.eventName}`,
    userId: (event.metadata?.userId as string) || 'system',
    tenantId: (event.metadata?.tenantId as string) || 'default',
    entityType: payload.entityType as string,
    entityId: payload.entityId as string,
    metadata: {
      eventId: event.eventId,
      occurredOn: event.occurredOn,
      payload,
    },
  });
  await next();
}