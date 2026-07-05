// modules/trips/services/trip-command.service.ts

import { commandBus } from '@/server/cqrs/command-bus';
import { CreateTripCommand } from '../commands/create-trip.command';
import { UpdateTripCommand } from '../commands/update-trip.command';
import { DeleteTripCommand } from '../commands/delete-trip.command';
import { Trip } from '@/shared/types/trip.types';

export class TripCommandService {
  async createTrip(
    rawData: unknown,
    tenantId: string,
    userId?: string
  ): Promise<Trip> {
    return commandBus.execute<Trip>(
      new CreateTripCommand(rawData, tenantId, userId)
    );
  }

  async updateTrip(
    tripId: string,
    rawData: unknown,
    tenantId: string,
    userId?: string
  ): Promise<Trip> {
    return commandBus.execute<Trip>(
      new UpdateTripCommand(tripId, rawData, tenantId, userId)
    );
  }

  async deleteTrip(
    tripId: string,
    tenantId: string,
    userId?: string,
    soft: boolean = false
  ): Promise<void> {
    return commandBus.execute<void>(
      new DeleteTripCommand(tripId, tenantId, userId, soft)
    );
  }
}

export const tripCommandService = new TripCommandService();