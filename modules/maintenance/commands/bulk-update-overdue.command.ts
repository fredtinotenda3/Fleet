// modules/maintenance/commands/bulk-update-overdue.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class BulkUpdateOverdueCommand extends BaseCommand {
  static readonly commandName = 'BulkUpdateOverdueCommand';

  constructor(
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(BulkUpdateOverdueCommand.commandName);
  }
}