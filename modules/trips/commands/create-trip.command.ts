// modules/trips/commands/create-trip.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class CreateTripCommand extends BaseCommand {
  constructor(
    public readonly rawData: unknown,
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(CreateTripCommand.name);
  }
}