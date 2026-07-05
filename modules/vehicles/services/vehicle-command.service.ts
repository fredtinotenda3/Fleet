// modules/vehicles/services/vehicle-command.service.ts

import { commandBus } from '@/server/cqrs/command-bus';
import { CreateVehicleCommand } from '../commands/create-vehicle.command';
import { UpdateVehicleCommand } from '../commands/update-vehicle.command';
import { DeleteVehicleCommand } from '../commands/delete-vehicle.command';
import { UpdateVehicleStatusCommand } from '../commands/update-vehicle-status.command';
import { Vehicle } from '@/shared/types/vehicle.types';

/**
 * Stable, dependency-light facade over the command bus for the Vehicles
 * write side. Other modules (workflows, analytics triggers, future event
 * handlers) should depend on this class rather than constructing and
 * dispatching commands directly — it gives us one place to add
 * cross-cutting concerns (e.g. emitting domain events in Phase 3)
 * without touching every call site.
 */
export class VehicleCommandService {
  async createVehicle(
    rawData: unknown,
    tenantId: string,
    userId?: string
  ): Promise<Vehicle> {
    return commandBus.execute<Vehicle>(
      new CreateVehicleCommand(rawData, tenantId, userId)
    );
  }

  async updateVehicle(
    vehicleId: string,
    rawData: unknown,
    tenantId: string,
    userId?: string
  ): Promise<Vehicle> {
    return commandBus.execute<Vehicle>(
      new UpdateVehicleCommand(vehicleId, rawData, tenantId, userId)
    );
  }

  async deleteVehicle(
    vehicleId: string,
    tenantId: string,
    userId?: string,
    soft: boolean = true
  ): Promise<void> {
    return commandBus.execute<void>(
      new DeleteVehicleCommand(vehicleId, tenantId, userId, soft)
    );
  }

  async updateVehicleStatus(
    vehicleId: string,
    status: Vehicle['status'],
    tenantId: string,
    userId?: string
  ): Promise<Vehicle> {
    return commandBus.execute<Vehicle>(
      new UpdateVehicleStatusCommand(vehicleId, status, tenantId, userId)
    );
  }
}

export const vehicleCommandService = new VehicleCommandService();