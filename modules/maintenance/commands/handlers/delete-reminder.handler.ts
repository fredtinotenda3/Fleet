// modules/maintenance/commands/handlers/delete-reminder.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { DeleteReminderCommand } from '../delete-reminder.command';
import { MaintenanceRepository } from '@/modules/maintenance/repositories/maintenance.repository';
import { NotFoundError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { ReminderDeletedEvent } from '@/modules/maintenance/events/ReminderDeletedEvent';

export class DeleteReminderHandler
  implements ICommandHandler<DeleteReminderCommand, void>
{
  constructor(private readonly maintenanceRepo: MaintenanceRepository) {}

  async execute(command: DeleteReminderCommand): Promise<void> {
    const existing = await this.maintenanceRepo.findById(
      command.reminderId,
      command.tenantId
    );
    if (!existing) {
      throw new NotFoundError('Reminder not found');
    }

    await this.maintenanceRepo.hardDelete(command.reminderId, command.tenantId);

    // Emit event
    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new ReminderDeletedEvent(
      command.reminderId,
      existing.license_plate,
      existing.title,
      command.tenantId,
      {
        userId: command.userId,
        correlationId: command.commandName,
      }
    ));
  }
}