// modules/vehicles/commands/handlers/delete-vehicle.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { DeleteVehicleCommand } from '../delete-vehicle.command';
import { VehicleRepository } from '@/modules/vehicles/repositories/vehicle.repository';
import { NotFoundError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { VehicleDeletedEvent } from '@/modules/vehicles/events/VehicleDeletedEvent';

export class DeleteVehicleHandler
  implements ICommandHandler<DeleteVehicleCommand, void>
{
  constructor(private readonly vehicleRepo: VehicleRepository) {}

  async execute(command: DeleteVehicleCommand): Promise<void> {
    const existing = await this.vehicleRepo.findById(
      command.vehicleId,
      command.tenantId
    );
    if (!existing) {
      throw new NotFoundError('Vehicle not found');
    }

    if (command.soft) {
      await this.vehicleRepo.softDelete(
        command.vehicleId,
        command.tenantId,
        command.userId
      );
    } else {
      await this.vehicleRepo.hardDelete(command.vehicleId, command.tenantId);
    }

    // Emit event
    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new VehicleDeletedEvent(
      command.vehicleId,
      existing.license_plate,
      command.tenantId,
      {
        userId: command.userId,
        correlationId: command.commandName,
        soft: command.soft,
      }
    ));
  }
}