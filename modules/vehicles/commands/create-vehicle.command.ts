// modules/vehicles/commands/create-vehicle.command.ts

import { BaseCommand } from '@/server/cqrs/command';

/**
 * Intent to create a new vehicle. `rawData` is intentionally typed as
 * `unknown` — validation against vehicleCreateSchema happens inside the
 * handler, not at command-construction time, so the command itself stays
 * a dumb data carrier and all business/validation logic lives in exactly
 * one place (the handler).
 */
export class CreateVehicleCommand extends BaseCommand {
  static readonly commandName = 'CreateVehicleCommand';

  constructor(
    public readonly rawData: unknown,
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(CreateVehicleCommand.commandName);
  }
}