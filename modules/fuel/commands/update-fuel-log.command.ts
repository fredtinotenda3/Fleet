// modules/fuel/commands/update-fuel-log.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class UpdateFuelLogCommand extends BaseCommand {
  static readonly commandName = 'UpdateFuelLogCommand';

  constructor(
    public readonly fuelLogId: string,
    public readonly rawData: unknown,
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(UpdateFuelLogCommand.commandName);
  }
}