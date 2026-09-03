// modules/vehicles/commands/handlers/assign-vehicle-driver.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { AssignVehicleDriverCommand } from '../assign-vehicle-driver.command';
import { VehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { DriverRepository } from '@/modules/drivers/repositories/driver.repository';
import { Vehicle } from '@/shared/types/vehicle.types';
import { NotFoundError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { VehicleUpdatedEvent } from '@/modules/vehicles/events/VehicleUpdatedEvent';
import { VehicleDriverAssignedEvent } from '@/modules/vehicles/events/VehicleDriverAssignedEvent';
import { VehicleDriverUnassignedEvent } from '@/modules/vehicles/events/VehicleDriverUnassignedEvent';

/**
 * Assign / change / clear a vehicle's current driver.
 *
 * BUSINESS RULE (documented in full on Vehicle.currentDriverId in
 * shared/types/vehicle.types.ts): a driver may be the CURRENT driver of
 * at most one vehicle at a time. Assigning a driver who already holds
 * another vehicle unassigns them from that vehicle first, in the same
 * command execution -- not a separate follow-up call the caller has to
 * make. A driver may still be *historically* linked to many vehicles
 * (Trip.driver_id, DriverShift.driverId); only "current" is exclusive.
 *
 * Cross-tenant and cross-org-unit protection: tenant isolation is
 * enforced here via VehicleRepository.findById/update and
 * DriverRepository.findById, all of which are tenant-scoped and refuse
 * to see rows outside `command.tenantId`. Org-unit scoping (a caller
 * restricted to one branch acting on a vehicle or driver from another)
 * is enforced one layer up, in VehicleController.assignVehicleDriver --
 * see that method's comment for why: TenantContext is a request-scoped
 * concept this command layer does not carry, matching how every other
 * vehicle command in this module works (org-unit checks live in
 * loadInScopeVehicle(), not in the command handlers).
 */
export class AssignVehicleDriverHandler
  implements ICommandHandler<AssignVehicleDriverCommand, Vehicle>
{
  constructor(
    private readonly vehicleRepo: VehicleRepository,
    private readonly driverRepo: DriverRepository
  ) {}

  async execute(command: AssignVehicleDriverCommand): Promise<Vehicle> {
    const vehicle = await this.vehicleRepo.findById(command.vehicleId, command.tenantId);
    if (!vehicle) {
      throw new NotFoundError('Vehicle not found');
    }

    const previousDriverId = vehicle.currentDriverId ?? null;
    const nextDriverId = command.driverId;

    const eventBus = EventBusFactory.getInstance();

    if (nextDriverId) {
      // NotFoundError here covers both "no such driver" and "driver
      // belongs to another tenant" -- findById's own tenant filter
      // already refuses to return a cross-tenant row, and a soft-deleted
      // driver is excluded by the same default (includeDeleted: false)
      // that every other read in this codebase relies on.
      const driver = await this.driverRepo.findById(nextDriverId, command.tenantId);
      if (!driver) {
        throw new NotFoundError('Driver not found');
      }

      // Enforce "one vehicle per driver": clear this driver from every
      // OTHER vehicle they currently hold before assigning them here.
      const otherVehicles = await this.vehicleRepo.findByCurrentDriver(
        nextDriverId,
        command.tenantId,
        command.vehicleId
      );

      for (const other of otherVehicles) {
        const cleared = await this.vehicleRepo.update(
          other._id!,
          { currentDriverId: null },
          command.tenantId,
          command.userId
        );
        if (!cleared) continue;

        await eventBus.publish(
          new VehicleUpdatedEvent(
            cleared,
            { currentDriverId: null },
            {
              tenantId: command.tenantId,
              userId: command.userId,
              correlationId: command.commandName,
              reason: 'driver_reassigned_to_another_vehicle',
            }
          )
        );
        await eventBus.publish(
          new VehicleDriverUnassignedEvent(cleared, nextDriverId, {
            tenantId: command.tenantId,
            userId: command.userId,
            correlationId: command.commandName,
            reason: 'driver_reassigned_to_another_vehicle',
          })
        );
      }
    }

    const updated = await this.vehicleRepo.update(
      command.vehicleId,
      { currentDriverId: nextDriverId },
      command.tenantId,
      command.userId
    );
    if (!updated) {
      throw new NotFoundError('Vehicle not found');
    }

    await eventBus.publish(
      new VehicleUpdatedEvent(
        updated,
        { currentDriverId: nextDriverId },
        {
          tenantId: command.tenantId,
          userId: command.userId,
          correlationId: command.commandName,
        }
      )
    );

    if (nextDriverId) {
      await eventBus.publish(
        new VehicleDriverAssignedEvent(updated, nextDriverId, previousDriverId, {
          tenantId: command.tenantId,
          userId: command.userId,
          correlationId: command.commandName,
        })
      );
    } else if (previousDriverId) {
      // Only emit the "unassigned" event when there was actually a
      // driver to clear -- calling PATCH with driverId: null on a
      // vehicle that already has no driver is a no-op, not an event.
      await eventBus.publish(
        new VehicleDriverUnassignedEvent(updated, previousDriverId, {
          tenantId: command.tenantId,
          userId: command.userId,
          correlationId: command.commandName,
        })
      );
    }

    return updated;
  }
}
