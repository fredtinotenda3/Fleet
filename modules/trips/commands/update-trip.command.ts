// modules/trips/commands/update-trip.command.ts

import { BaseCommand } from '@/server/cqrs/command';
import { WriteScope } from '@/server/tenancy/write-scope';

export class UpdateTripCommand extends BaseCommand {
  static readonly commandName = 'UpdateTripCommand';

  constructor(
    public readonly tripId: string,
    public readonly rawData: unknown,
    public readonly tenantId: string,
    /** Authority this write runs under. See server/tenancy/write-scope.ts. */
    public readonly scope: WriteScope,
    public readonly userId?: string
  ) {
    super(UpdateTripCommand.commandName);
  }
}