// modules/maintenance/services/maintenance-command.service.ts

import { commandBus } from '@/server/cqrs/command-bus';
import { CreateReminderCommand } from '../commands/create-reminder.command';
import { UpdateReminderCommand } from '../commands/update-reminder.command';
import { DeleteReminderCommand } from '../commands/delete-reminder.command';
import { CompleteReminderCommand } from '../commands/complete-reminder.command';
import { BulkUpdateOverdueCommand } from '../commands/bulk-update-overdue.command';
import { Reminder } from '@/shared/types/maintenance.types';
import type { BulkUpdateOverdueResult } from '../commands/handlers/bulk-update-overdue.handler';

export class MaintenanceCommandService {
  async createReminder(
    rawData: unknown,
    tenantId: string,
    userId?: string
  ): Promise<Reminder> {
    return commandBus.execute<Reminder>(
      new CreateReminderCommand(rawData, tenantId, userId)
    );
  }

  async updateReminder(
    reminderId: string,
    rawData: unknown,
    tenantId: string,
    userId?: string
  ): Promise<Reminder> {
    return commandBus.execute<Reminder>(
      new UpdateReminderCommand(reminderId, rawData, tenantId, userId)
    );
  }

  async deleteReminder(
    reminderId: string,
    tenantId: string,
    userId?: string
  ): Promise<void> {
    return commandBus.execute<void>(
      new DeleteReminderCommand(reminderId, tenantId, userId)
    );
  }

  async completeReminder(
    reminderId: string,
    tenantId: string,
    userId?: string,
    completionDate?: Date
  ): Promise<Reminder> {
    return commandBus.execute<Reminder>(
      new CompleteReminderCommand(reminderId, tenantId, userId, completionDate)
    );
  }

  async bulkUpdateOverdue(
    tenantId: string,
    userId?: string
  ): Promise<BulkUpdateOverdueResult> {
    return commandBus.execute<BulkUpdateOverdueResult>(
      new BulkUpdateOverdueCommand(tenantId, userId)
    );
  }
}

export const maintenanceCommandService = new MaintenanceCommandService();