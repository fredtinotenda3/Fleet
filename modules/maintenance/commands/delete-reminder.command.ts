// modules/maintenance/commands/delete-reminder.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class DeleteReminderCommand extends BaseCommand {
  static readonly commandName = 'DeleteReminderCommand';

  constructor(
    public readonly reminderId: string,
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(DeleteReminderCommand.commandName);
  }
}