// modules/trips/commands/create-trip.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class CreateTripCommand extends BaseCommand {
  static readonly commandName = 'CreateTripCommand';

  constructor(
    public readonly rawData: unknown,
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(CreateTripCommand.commandName);
  }
}