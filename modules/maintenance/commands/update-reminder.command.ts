// modules/maintenance/commands/update-reminder.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class UpdateReminderCommand extends BaseCommand {
  constructor(
    public readonly reminderId: string,
    public readonly rawData: unknown,
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(UpdateReminderCommand.name);
  }
}