// modules/maintenance/events/ReminderUpdatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { REMINDER_UPDATED } from '@/server/events/event-names';
import { Reminder } from '@/shared/types/maintenance.types';

export class ReminderUpdatedEvent extends DomainEvent {
  constructor(
    reminder: Reminder,
    changes: Partial<Reminder>,
    metadata?: Record<string, unknown>,
  ) {
    super(REMINDER_UPDATED, {
      entityId: reminder._id,
      entityType: 'reminder',
      license_plate: reminder.license_plate,
      title: reminder.title,
      status: reminder.status,
      changes,
      tenantId: reminder.tenantId,
    }, metadata);
  }
}