// server/events/middleware/AuditMiddleware.ts

import { IEvent } from '../base/IEvent';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { resolveEventTenantOrWarn } from '../utils/event-tenant.utils';

export async function auditMiddleware(
  event: IEvent,
  next: () => Promise<void>,
): Promise<void> {
  const payload = event.payload;
  const tenantId = resolveEventTenantOrWarn(event, 'auditMiddleware');

  // A missing/legacy tenant scope must not be written into the
  // append-only, hash-chained audit ledger (AuditLogRepository has no
  // scope check of its own to catch this later) -- see
  // event-tenant.utils.ts for why. Skip the audit write but still run
  // the rest of the pipeline so a metadata gap on one event doesn't
  // stall unrelated processing.
  if (tenantId) {
    await auditLog.log({
      action: `EVENT_${event.eventName}`,
      userId: (event.metadata?.userId as string) || 'system',
      tenantId,
      entityType: payload.entityType as string,
      entityId: payload.entityId as string,
      metadata: {
        eventId: event.eventId,
        occurredOn: event.occurredOn,
        payload,
      },
    });
  }
  await next();
}