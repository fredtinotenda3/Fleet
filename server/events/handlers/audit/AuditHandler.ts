// server/events/handlers/audit/AuditHandler.ts

import { IEventHandler } from '../../base/IEventHandler';
import { DomainEvent } from '../../base/DomainEvent';
import { auditLog } from '@/infrastructure/monitoring/audit.logger';

export class AuditHandler implements IEventHandler<DomainEvent> {
  async handle(event: DomainEvent): Promise<void> {
    const payload = event.payload;
    const tenantId = (event.metadata?.tenantId as string) || 'default';
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