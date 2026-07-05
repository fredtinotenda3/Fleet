// modules/trips/commands/update-trip.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class UpdateTripCommand extends BaseCommand {
  constructor(
    public readonly tripId: string,
    public readonly rawData: unknown,
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(UpdateTripCommand.name);
  }
}