// modules/vehicles/commands/update-vehicle-status.command.ts

import { BaseCommand } from '@/server/cqrs/command';
import { Vehicle } from '@/shared/types/vehicle.types';

export class UpdateVehicleStatusCommand extends BaseCommand {
  static readonly commandName = 'UpdateVehicleStatusCommand';

  constructor(
    public readonly vehicleId: string,
    public readonly status: Vehicle['status'],
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(UpdateVehicleStatusCommand.commandName);
  }
}