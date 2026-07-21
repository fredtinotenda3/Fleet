// modules/trips/commands/delete-trip.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class DeleteTripCommand extends BaseCommand {
  static readonly commandName = 'DeleteTripCommand';

  constructor(
    public readonly tripId: string,
    public readonly tenantId: string,
    public readonly userId?: string,
    public readonly soft: boolean = false
  ) {
    super(DeleteTripCommand.commandName);
  }
}