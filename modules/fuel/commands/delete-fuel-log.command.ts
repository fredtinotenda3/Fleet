// modules/fuel/commands/delete-fuel-log.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class DeleteFuelLogCommand extends BaseCommand {
  static readonly commandName = 'DeleteFuelLogCommand';

  constructor(
    public readonly fuelLogId: string,
    public readonly tenantId: string,
    public readonly userId?: string,
    public readonly soft: boolean = false
  ) {
    super(DeleteFuelLogCommand.commandName);
  }
}