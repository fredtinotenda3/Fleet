// modules/maintenance/events/ReminderDeletedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { REMINDER_DELETED } from '@/server/events/event-names';

export class ReminderDeletedEvent extends DomainEvent {
  constructor(
    reminderId: string,
    licensePlate: string,
    title: string,
    tenantId: string,
    metadata?: Record<string, unknown>,
  ) {
    super(REMINDER_DELETED, {
      entityId: reminderId,
      entityType: 'reminder',
      license_plate: licensePlate,
      title,
      tenantId,
    }, metadata);
  }
}