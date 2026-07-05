// modules/trips/cqrs.register.ts

import { CommandBus } from '@/server/cqrs/command-bus';
import { QueryBus } from '@/server/cqrs/query-bus';
import { tripRepository } from './repositories/trip.repository';

import { CreateTripCommand } from './commands/create-trip.command';
import { UpdateTripCommand } from './commands/update-trip.command';
import { DeleteTripCommand } from './commands/delete-trip.command';

import { CreateTripHandler } from './commands/handlers/create-trip.handler';
import { UpdateTripHandler } from './commands/handlers/update-trip.handler';
import { DeleteTripHandler } from './commands/handlers/delete-trip.handler';

import { GetTripsQuery } from './queries/get-trips.query';
import { GetTripByIdQuery } from './queries/get-trip-by-id.query';
import { GetTripStatsQuery } from './queries/get-trip-stats.query';
import { GetDailyDistanceQuery } from './queries/get-daily-distance.query';

import { GetTripsHandler } from './queries/handlers/get-trips.handler';
import { GetTripByIdHandler } from './queries/handlers/get-trip-by-id.handler';
import { GetTripStatsHandler } from './queries/handlers/get-trip-stats.handler';
import { GetDailyDistanceHandler } from './queries/handlers/get-daily-distance.handler';

export function registerTripCqrsHandlers(
  commandBus: CommandBus,
  queryBus: QueryBus
): void {
  // Commands
  commandBus.register(CreateTripCommand, new CreateTripHandler(tripRepository));
  commandBus.register(UpdateTripCommand, new UpdateTripHandler(tripRepository));
  commandBus.register(DeleteTripCommand, new DeleteTripHandler(tripRepository));

  // Queries
  queryBus.register(GetTripsQuery, new GetTripsHandler(tripRepository));
  queryBus.register(GetTripByIdQuery, new GetTripByIdHandler(tripRepository));
  queryBus.register(GetTripStatsQuery, new GetTripStatsHandler(tripRepository));
  queryBus.register(GetDailyDistanceQuery, new GetDailyDistanceHandler(tripRepository));
}