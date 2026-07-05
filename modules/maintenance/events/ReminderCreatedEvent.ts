// modules/maintenance/events/ReminderCreatedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { REMINDER_CREATED } from '@/server/events/event-names';
import { Reminder } from '@/shared/types/maintenance.types';

export class ReminderCreatedEvent extends DomainEvent {
  constructor(reminder: Reminder, metadata?: Record<string, unknown>) {
    super(REMINDER_CREATED, {
      entityId: reminder._id,
      entityType: 'reminder',
      license_plate: reminder.license_plate,
      title: reminder.title,
      due_date: reminder.due_date,
      status: reminder.status,
      priority: reminder.priority,
      tenantId: reminder.tenantId,
    }, metadata);
  }
}