// modules/vehicles/commands/delete-vehicle.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class DeleteVehicleCommand extends BaseCommand {
  static readonly commandName = 'DeleteVehicleCommand';

  constructor(
    public readonly vehicleId: string,
    public readonly tenantId: string,
    public readonly userId?: string,
    public readonly soft: boolean = true
  ) {
    super(DeleteVehicleCommand.commandName);
  }
}