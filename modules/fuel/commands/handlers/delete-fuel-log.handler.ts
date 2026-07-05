// modules/fuel/commands/handlers/delete-fuel-log.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { DeleteFuelLogCommand } from '../delete-fuel-log.command';
import { FuelRepository } from '@/modules/fuel/repositories/fuel.repository';
import { NotFoundError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { FuelLogDeletedEvent } from '@/modules/fuel/events/FuelLogDeletedEvent';

export class DeleteFuelLogHandler
  implements ICommandHandler<DeleteFuelLogCommand, void>
{
  constructor(private readonly fuelRepo: FuelRepository) {}

  async execute(command: DeleteFuelLogCommand): Promise<void> {
    const existing = await this.fuelRepo.findById(
      command.fuelLogId,
      command.tenantId
    );
    if (!existing) {
      throw new NotFoundError('Fuel log not found');
    }

    if (command.soft) {
      await this.fuelRepo.softDelete(
        command.fuelLogId,
        command.tenantId,
        command.userId
      );
    } else {
      await this.fuelRepo.hardDelete(command.fuelLogId, command.tenantId);
    }

    // Emit event
    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new FuelLogDeletedEvent(
      command.fuelLogId,
      existing.license_plate,
      existing.fuel_volume,
      command.tenantId,
      {
        userId: command.userId,
        correlationId: command.commandName,
        soft: command.soft,
      }
    ));
  }
}