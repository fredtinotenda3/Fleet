// modules/maintenance/commands/handlers/complete-reminder.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { CompleteReminderCommand } from '../complete-reminder.command';
import { MaintenanceRepository } from '@/modules/maintenance/repositories/maintenance.repository';
import { Reminder, ReminderStatus } from '@/shared/types/maintenance.types';
import { NotFoundError, AppError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { ReminderCompletedEvent } from '@/modules/maintenance/events/ReminderCompletedEvent';

function addInterval(date: Date, interval: string): Date {
  const next = new Date(date);
  const amount = parseInt(interval, 10);
  const unit = interval.slice(-1);

  if (unit === 'd') next.setDate(next.getDate() + amount);
  else if (unit === 'm') next.setMonth(next.getMonth() + amount);
  else if (unit === 'y') next.setFullYear(next.getFullYear() + amount);

  return next;
}

export class CompleteReminderHandler
  implements ICommandHandler<CompleteReminderCommand, Reminder>
{
  constructor(private readonly maintenanceRepo: MaintenanceRepository) {}

  async execute(command: CompleteReminderCommand): Promise<Reminder> {
    const existing = await this.maintenanceRepo.findById(
      command.reminderId,
      command.tenantId
    );
    if (!existing) {
      throw new NotFoundError('Reminder not found');
    }

    if (existing.status === 'completed') {
      throw new AppError(
        'Reminder is already completed',
        'ALREADY_COMPLETED',
        409
      );
    }

    const updated = await this.maintenanceRepo.completeReminder(
      command.reminderId,
      command.tenantId,
      command.userId,
      command.completionDate
    );

    if (!updated) {
      throw new NotFoundError('Reminder not found');
    }

    // Emit event
    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new ReminderCompletedEvent(updated, {
      tenantId: command.tenantId,
      userId: command.userId,
      correlationId: command.commandName,
    }));

    if (
      existing.recurrence_interval &&
      existing.recurrence_interval !== 'none'
    ) {
      const nextDueDate = addInterval(
        new Date(existing.due_date),
        existing.recurrence_interval
      );

      const nextReminder: Omit<
        Reminder,
        '_id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt'
      > = {
        tenantId: command.tenantId,
        orgUnitId: existing.orgUnitId,
        license_plate: existing.license_plate,
        title: existing.title,
        due_date: nextDueDate,
        status: 'pending' as ReminderStatus,
        notes: existing.notes,
        priority: existing.priority,
        category: existing.category,
        service_type: existing.service_type,
        recurrence_interval: existing.recurrence_interval,
        assigned_to: existing.assigned_to,
        estimated_cost: existing.estimated_cost,
      };

      await this.maintenanceRepo.create(
        nextReminder,
        command.tenantId,
        command.userId
      );
    }

    return updated;
  }
}