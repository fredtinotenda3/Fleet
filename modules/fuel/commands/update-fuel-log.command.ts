// modules/fuel/commands/update-fuel-log.command.ts

import { BaseCommand } from '@/server/cqrs/command';
import { WriteScope } from '@/server/tenancy/write-scope';

export class UpdateFuelLogCommand extends BaseCommand {
  static readonly commandName = 'UpdateFuelLogCommand';

  constructor(
    public readonly fuelLogId: string,
    public readonly rawData: unknown,
    public readonly tenantId: string,
    /**
     * See CreateFuelLogCommand.scope. Update needs this at least as much
     * as create does: re-plating a fuel log rewrites its `orgUnitId` from
     * the new vehicle, which moves the record between branches. That move
     * was previously performed with no check of either boundary.
     */
    public readonly scope: WriteScope,
    public readonly userId?: string
  ) {
    super(UpdateFuelLogCommand.commandName);
  }
}