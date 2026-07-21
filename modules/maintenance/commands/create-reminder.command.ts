// modules/maintenance/commands/create-reminder.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class CreateReminderCommand extends BaseCommand {
  static readonly commandName = 'CreateReminderCommand';

  constructor(
    public readonly rawData: unknown,
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(CreateReminderCommand.commandName);
  }
}