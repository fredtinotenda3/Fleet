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
      /**
       * ADDED for the allocation ledger: the amount, and the date the
       * cost was actually incurred.
       *
       * `estimated_cost` is the only cost signal Reminder carries -- there
       * is no actuals field (see the audit note in maintenance.types.ts).
       * That is stated on the posting's description rather than hidden,
       * because a maintenance figure a finance user reconciles must not
       * silently be an estimate.
       */
      cost: reminder.estimated_cost,
      cost_is_estimate: true,
      date: reminder.completion_date ?? reminder.due_date,
      tenantId: reminder.tenantId,
    }, metadata);
  }
}