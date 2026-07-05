// modules/trips/commands/handlers/delete-trip.handler.ts

import { ICommandHandler } from '@/server/cqrs/command';
import { DeleteTripCommand } from '../delete-trip.command';
import { TripRepository } from '@/modules/trips/repositories/trip.repository';
import { NotFoundError } from '@/server/errors/app.errors';
import { EventBusFactory } from '@/server/events/bus/EventBusFactory';
import { TripDeletedEvent } from '@/modules/trips/events/TripDeletedEvent';

export class DeleteTripHandler implements ICommandHandler<DeleteTripCommand, void> {
  constructor(private readonly tripRepo: TripRepository) {}

  async execute(command: DeleteTripCommand): Promise<void> {
    const existing = await this.tripRepo.findById(command.tripId, command.tenantId);
    if (!existing) {
      throw new NotFoundError('Trip not found');
    }

    if (command.soft) {
      await this.tripRepo.softDelete(command.tripId, command.tenantId, command.userId);
    } else {
      await this.tripRepo.hardDelete(command.tripId, command.tenantId);
    }

    // Emit event
    const eventBus = EventBusFactory.getInstance();
    await eventBus.publish(new TripDeletedEvent(
      command.tripId,
      existing.license_plate,
      existing.distance_calculated,
      command.tenantId,
      {
        userId: command.userId,
        correlationId: command.commandName,
        soft: command.soft,
      }
    ));
  }
}