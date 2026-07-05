// modules/maintenance/commands/bulk-update-overdue.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class BulkUpdateOverdueCommand extends BaseCommand {
  constructor(
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(BulkUpdateOverdueCommand.name);
  }
}