// modules/trips/cqrs.register.ts

import { CommandBus } from '@/server/cqrs/command-bus';
import { QueryBus } from '@/server/cqrs/query-bus';
import { tripRepository } from './repositories/trip.repository';

import { CreateTripCommand } from './commands/create-trip.command';
import { UpdateTripCommand } from './commands/update-trip.command';
import { DeleteTripCommand } from './commands/delete-trip.command';
import { ImportTripsCommand } from './commands/import-trips.command';

import { CreateTripHandler } from './commands/handlers/create-trip.handler';
import { UpdateTripHandler } from './commands/handlers/update-trip.handler';
import { DeleteTripHandler } from './commands/handlers/delete-trip.handler';
import { ImportTripsHandler } from './commands/handlers/import-trips.handler';

import { GetTripsQuery } from './queries/get-trips.query';
import { GetTripByIdQuery } from './queries/get-trip-by-id.query';
import { GetTripStatsQuery } from './queries/get-trip-stats.query';
import { GetDailyDistanceQuery } from './queries/get-daily-distance.query';
import { GetTripKpisQuery } from './queries/get-trip-kpis.query';
import { GetTripExceptionsQuery } from './queries/get-trip-exceptions.query';
// PHASE 2
import { GetMonthlyTripTrendQuery } from './queries/get-monthly-trip-trend.query';
import { GetVehicleUtilizationQuery } from './queries/get-vehicle-utilization.query';
import { GetDriverUtilizationQuery } from './queries/get-driver-utilization.query';
import { GetTripDistanceDistributionQuery } from './queries/get-trip-distance-distribution.query';
import { GetTripsByDayOfWeekQuery } from './queries/get-trips-by-day-of-week.query';
// PHASE 3
import { GetTripCostAnalyticsQuery } from './queries/get-trip-cost-analytics.query';
import { GetTripCostSummaryQuery } from './queries/get-trip-cost-summary.query';

import { GetTripsHandler } from './queries/handlers/get-trips.handler';
import { GetTripByIdHandler } from './queries/handlers/get-trip-by-id.handler';
import { GetTripStatsHandler } from './queries/handlers/get-trip-stats.handler';
import { GetDailyDistanceHandler } from './queries/handlers/get-daily-distance.handler';
import { GetTripKpisHandler } from './queries/handlers/get-trip-kpis.handler';
import { GetTripExceptionsHandler } from './queries/handlers/get-trip-exceptions.handler';
// PHASE 2
import { GetMonthlyTripTrendHandler } from './queries/handlers/get-monthly-trip-trend.handler';
import { GetVehicleUtilizationHandler } from './queries/handlers/get-vehicle-utilization.handler';
import { GetDriverUtilizationHandler } from './queries/handlers/get-driver-utilization.handler';
import { GetTripDistanceDistributionHandler } from './queries/handlers/get-trip-distance-distribution.handler';
import { GetTripsByDayOfWeekHandler } from './queries/handlers/get-trips-by-day-of-week.handler';
// PHASE 3
import { GetTripCostAnalyticsHandler } from './queries/handlers/get-trip-cost-analytics.handler';
import { GetTripCostSummaryHandler } from './queries/handlers/get-trip-cost-summary.handler';

export function registerTripCqrsHandlers(
  commandBus: CommandBus,
  queryBus: QueryBus
): void {
  // Commands
  commandBus.register(CreateTripCommand, new CreateTripHandler(tripRepository));
  commandBus.register(UpdateTripCommand, new UpdateTripHandler(tripRepository));
  commandBus.register(DeleteTripCommand, new DeleteTripHandler(tripRepository));
  commandBus.register(ImportTripsCommand, new ImportTripsHandler(tripRepository));

  // Queries
  queryBus.register(GetTripsQuery, new GetTripsHandler(tripRepository));
  queryBus.register(GetTripByIdQuery, new GetTripByIdHandler(tripRepository));
  queryBus.register(GetTripStatsQuery, new GetTripStatsHandler(tripRepository));
  queryBus.register(GetDailyDistanceQuery, new GetDailyDistanceHandler(tripRepository));
  // PHASE 1 additions
  queryBus.register(GetTripKpisQuery, new GetTripKpisHandler(tripRepository));
  queryBus.register(GetTripExceptionsQuery, new GetTripExceptionsHandler(tripRepository));
  // PHASE 2 additions (enterprise analytics)
  queryBus.register(GetMonthlyTripTrendQuery, new GetMonthlyTripTrendHandler(tripRepository));
  queryBus.register(GetVehicleUtilizationQuery, new GetVehicleUtilizationHandler(tripRepository));
  queryBus.register(GetDriverUtilizationQuery, new GetDriverUtilizationHandler(tripRepository));
  queryBus.register(
    GetTripDistanceDistributionQuery,
    new GetTripDistanceDistributionHandler(tripRepository)
  );
  queryBus.register(GetTripsByDayOfWeekQuery, new GetTripsByDayOfWeekHandler(tripRepository));
  // PHASE 3 additions (cross-module cost analytics)
  queryBus.register(GetTripCostAnalyticsQuery, new GetTripCostAnalyticsHandler(tripRepository));
  queryBus.register(GetTripCostSummaryQuery, new GetTripCostSummaryHandler(tripRepository));
}