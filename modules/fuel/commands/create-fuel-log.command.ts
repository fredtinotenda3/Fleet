// modules/fuel/commands/create-fuel-log.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class CreateFuelLogCommand extends BaseCommand {
  constructor(
    public readonly rawData: unknown,
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(CreateFuelLogCommand.name);
  }
}