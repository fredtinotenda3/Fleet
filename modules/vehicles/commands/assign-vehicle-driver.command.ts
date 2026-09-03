// modules/vehicles/commands/assign-vehicle-driver.command.ts

import { BaseCommand } from '@/server/cqrs/command';

/**
 * Assigns, changes, or clears a vehicle's current driver.
 *
 * `driverId: null` clears the assignment. There is no separate "clear"
 * command -- PATCH /api/vehicles/:id/driver is idempotent on this one
 * field, so assign/change/clear are all the same write with a different
 * value, matching the frontend's AssignVehicleDriverPayload contract
 * (frontend/modules/vehicles/types/index.ts).
 *
 * Authorization (Permission.DRIVER_ASSIGN) and org-unit-scope checks for
 * both the vehicle and the driver happen in VehicleController before this
 * command is dispatched -- see loadInScopeVehicle() and
 * assignVehicleDriver(). This command and its handler are the persistence
 * boundary: tenant isolation is enforced again here (defense in depth,
 * same as every other vehicle command), but org-unit scoping is not
 * re-derived here since TenantContext is a request-scoped concept the
 * command layer does not carry.
 */
export class AssignVehicleDriverCommand extends BaseCommand {
  static readonly commandName = 'AssignVehicleDriverCommand';

  constructor(
    public readonly vehicleId: string,
    public readonly driverId: string | null,
    public readonly tenantId: string,
    public readonly userId?: string
  ) {
    super(AssignVehicleDriverCommand.commandName);
  }
}
