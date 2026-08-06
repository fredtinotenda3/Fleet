// server/events/handlers/audit/AuditHandler.ts

import { IEventHandler } from '../../base/IEventHandler';
import { DomainEvent } from '../../base/DomainEvent';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';
import { resolveEventTenantOrWarn } from '../../utils/event-tenant.utils';

export class AuditHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const payload = event.payload;
    // A missing/legacy tenant scope must never be written into the
    // append-only, hash-chained audit ledger -- see event-tenant.utils.ts.
    const tenantId = resolveEventTenantOrWarn(event, 'AuditHandler');
    if (!tenantId) return;
    const userId = (event.metadata?.userId as string) || 'system';

    await auditLog.log({
      action: `EVENT_${event.eventName}`,
      userId,
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
}