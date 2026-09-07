// modules/fuel/commands/create-fuel-log.command.ts

import { BaseCommand } from '@/server/cqrs/command';
import { WriteScope } from '@/server/tenancy/write-scope';

export class CreateFuelLogCommand extends BaseCommand {
  static readonly commandName = 'CreateFuelLogCommand';

  constructor(
    public readonly rawData: unknown,
    public readonly tenantId: string,
    /**
     * The authority this write is performed under. REQUIRED, and not
     * derivable from `tenantId` alone -- see server/tenancy/write-scope.ts
     * for why an optional context here would reintroduce the unscoped
     * vehicle lookup this field exists to prevent.
     */
    public readonly scope: WriteScope,
    public readonly userId?: string
  ) {
    super(CreateFuelLogCommand.commandName);
  }
}