// modules/vehicles/commands/update-vehicle.command.ts

import { BaseCommand } from '@/server/cqrs/command';

export class UpdateVehicleCommand extends BaseCommand {
  constructor(
    public readonly vehicleId: string,
    public readonly rawData: unknown,
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(UpdateVehicleCommand.name);
  }
}