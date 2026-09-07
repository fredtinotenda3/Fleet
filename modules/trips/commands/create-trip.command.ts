// modules/trips/commands/create-trip.command.ts

import { BaseCommand } from '@/server/cqrs/command';
import { WriteScope } from '@/server/tenancy/write-scope';

export class CreateTripCommand extends BaseCommand {
  static readonly commandName = 'CreateTripCommand';

  constructor(
    public readonly rawData: unknown,
    public readonly tenantId: string,
    /** Authority this write runs under. See server/tenancy/write-scope.ts. */
    public readonly scope: WriteScope,
    public readonly userId?: string
  ) {
    super(CreateTripCommand.commandName);
  }
}