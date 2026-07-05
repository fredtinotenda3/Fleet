// modules/vehicles/cqrs.register.ts

import { CommandBus } from '@/server/cqrs/command-bus';
import { QueryBus } from '@/server/cqrs/query-bus';
import { vehicleRepository } from './repositories/vehicle.repository';

import { CreateVehicleCommand } from './commands/create-vehicle.command';
import { UpdateVehicleCommand } from './commands/update-vehicle.command';
import { DeleteVehicleCommand } from './commands/delete-vehicle.command';
import { UpdateVehicleStatusCommand } from './commands/update-vehicle-status.command';

import { CreateVehicleHandler } from './commands/handlers/create-vehicle.handler';
import { UpdateVehicleHandler } from './commands/handlers/update-vehicle.handler';
import { DeleteVehicleHandler } from './commands/handlers/delete-vehicle.handler';
import { UpdateVehicleStatusHandler } from './commands/handlers/update-vehicle-status.handler';

import { GetVehicleByIdQuery } from './queries/get-vehicle-by-id.query';
import { GetVehicleByLicensePlateQuery } from './queries/get-vehicle-by-license-plate.query';
import { GetVehiclesQuery } from './queries/get-vehicles.query';
import { GetVehicleStatsQuery } from './queries/get-vehicle-stats.query';
import { SearchVehiclesQuery } from './queries/search-vehicles.query';
import { GetVehiclesByStatusQuery } from './queries/get-vehicles-by-status.query';
import { GetVehiclesDueForServiceQuery } from './queries/get-vehicles-due-for-service.query';
import { GetVehicleAnalyticsQuery } from './queries/get-vehicle-analytics.query';

import { GetVehicleByIdHandler } from './queries/handlers/get-vehicle-by-id.handler';
import { GetVehicleByLicensePlateHandler } from './queries/handlers/get-vehicle-by-license-plate.handler';
import { GetVehiclesHandler } from './queries/handlers/get-vehicles.handler';
import { GetVehicleStatsHandler } from './queries/handlers/get-vehicle-stats.handler';
import { SearchVehiclesHandler } from './queries/handlers/search-vehicles.handler';
import { GetVehiclesByStatusHandler } from './queries/handlers/get-vehicles-by-status.handler';
import { GetVehiclesDueForServiceHandler } from './queries/handlers/get-vehicles-due-for-service.handler';
import { GetVehicleAnalyticsHandler } from './queries/handlers/get-vehicle-analytics.handler';

/**
 * Registers every command and query handler for the Vehicles domain
 * against the supplied buses. Called exactly once, from
 * server/cqrs/cqrs.module.ts's bootstrapCqrs(). Keeping registration
 * self-contained inside the module (rather than scattered across the
 * central bootstrap file) is what lets each domain module own its full
 * CQRS wiring independently, per the "no cross-domain coupling" goal.
 */
export function registerVehicleCqrsHandlers(
  commandBus: CommandBus,
  queryBus: QueryBus
): void {
  // Commands
  commandBus.register(CreateVehicleCommand, new CreateVehicleHandler(vehicleRepository));
  commandBus.register(UpdateVehicleCommand, new UpdateVehicleHandler(vehicleRepository));
  commandBus.register(DeleteVehicleCommand, new DeleteVehicleHandler(vehicleRepository));
  commandBus.register(
    UpdateVehicleStatusCommand,
    new UpdateVehicleStatusHandler(vehicleRepository)
  );

  // Queries
  queryBus.register(GetVehicleByIdQuery, new GetVehicleByIdHandler(vehicleRepository));
  queryBus.register(
    GetVehicleByLicensePlateQuery,
    new GetVehicleByLicensePlateHandler(vehicleRepository)
  );
  queryBus.register(GetVehiclesQuery, new GetVehiclesHandler(vehicleRepository));
  queryBus.register(GetVehicleStatsQuery, new GetVehicleStatsHandler(vehicleRepository));
  queryBus.register(SearchVehiclesQuery, new SearchVehiclesHandler(vehicleRepository));
  queryBus.register(
    GetVehiclesByStatusQuery,
    new GetVehiclesByStatusHandler(vehicleRepository)
  );
  queryBus.register(
    GetVehiclesDueForServiceQuery,
    new GetVehiclesDueForServiceHandler(vehicleRepository)
  );
  queryBus.register(
    GetVehicleAnalyticsQuery,
    new GetVehicleAnalyticsHandler(vehicleRepository)
  );
}