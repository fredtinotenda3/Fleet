// modules/maintenance/events/ReminderCompletedEvent.ts

import { DomainEvent } from '@/server/events/base/DomainEvent';
import { REMINDER_COMPLETED } from '@/server/events/event-names';
import { Reminder } from '@/shared/types/maintenance.types';

export class ReminderCompletedEvent extends DomainEvent {
  constructor(reminder: Reminder, metadata?: Record<string, unknown>) {
    super(REMINDER_COMPLETED, {
      entityId: reminder._id,
      entityType: 'reminder',
      license_plate: reminder.license_plate,
      title: reminder.title,
      due_date: reminder.due_date,
      completion_date: reminder.completion_date,
      tenantId: reminder.tenantId,
    }, metadata);
  }
}