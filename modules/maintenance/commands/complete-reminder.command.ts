// modules/maintenance/commands/complete-reminder.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class CompleteReminderCommand extends BaseCommand {
  constructor(
    public readonly reminderId: string,
    public readonly tenantId: string,
    public readonly userId?: string,
    public readonly completionDate?: Date
  ) {
    super(CompleteReminderCommand.name);
  }
}