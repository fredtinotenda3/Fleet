// modules/trips/services/trip-command.service.ts

import { commandBus } from '@/server/cqrs/command-bus';
import { CreateTripCommand } from '../commands/create-trip.command';
import { UpdateTripCommand } from '../commands/update-trip.command';
import { DeleteTripCommand } from '../commands/delete-trip.command';
import { ImportTripsCommand, ImportTripRow } from '../commands/import-trips.command';
import type { ImportTripsResult } from '../commands/handlers/import-trips.handler';
import { Trip } from '@/shared/types/trip.types';
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { WriteScope, tenantIdOf } from '@/server/tenancy/write-scope';

export class TripCommandService {
  /** `scope` replaces `tenantId`; the tenant is derivable from it. */
  async createTrip(
    rawData: unknown,
    scope: WriteScope,
    userId?: string
  ): Promise<Trip> {
    return commandBus.execute<Trip>(
      new CreateTripCommand(rawData, tenantIdOf(scope), scope, userId)
    );
  }

  async updateTrip(
    tripId: string,
    rawData: unknown,
    scope: WriteScope,
    userId?: string
  ): Promise<Trip> {
    return commandBus.execute<Trip>(
      new UpdateTripCommand(tripId, rawData, tenantIdOf(scope), scope, userId)
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

  async importTrips(
    rows: ImportTripRow[],
    tenantId: string,
    userId?: string,
    context?: TenantContext
  ): Promise<ImportTripsResult> {
    return commandBus.execute<ImportTripsResult>(
      new ImportTripsCommand(rows, tenantId, userId, context)
    );
  }
}

export const tripCommandService = new TripCommandService();