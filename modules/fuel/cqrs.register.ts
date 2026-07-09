// modules/fuel/cqrs.register.ts

import { CommandBus } from '@/server/cqrs/command-bus';
import { QueryBus } from '@/server/cqrs/query-bus';
import { fuelRepository } from './repositories/fuel.repository';

import { CreateFuelLogCommand } from './commands/create-fuel-log.command';
import { UpdateFuelLogCommand } from './commands/update-fuel-log.command';
import { DeleteFuelLogCommand } from './commands/delete-fuel-log.command';

import { CreateFuelLogHandler } from './commands/handlers/create-fuel-log.handler';
import { UpdateFuelLogHandler } from './commands/handlers/update-fuel-log.handler';
import { DeleteFuelLogHandler } from './commands/handlers/delete-fuel-log.handler';

import { GetFuelLogsQuery } from './queries/get-fuel-logs.query';
import { GetFuelLogByIdQuery } from './queries/get-fuel-log-by-id.query';
import { GetFuelStatsQuery } from './queries/get-fuel-stats.query';
import { GetMonthlyFuelConsumptionQuery } from './queries/get-monthly-fuel-consumption.query';
import { GetTopFuelConsumersQuery } from './queries/get-top-fuel-consumers.query';
import { GetFuelKpisQuery } from './queries/get-fuel-kpis.query';
import { GetAbnormalFuelConsumptionQuery } from './queries/get-abnormal-fuel-consumption.query';

import { GetFuelLogsHandler } from './queries/handlers/get-fuel-logs.handler';
import { GetFuelLogByIdHandler } from './queries/handlers/get-fuel-log-by-id.handler';
import { GetFuelStatsHandler } from './queries/handlers/get-fuel-stats.handler';
import { GetMonthlyFuelConsumptionHandler } from './queries/handlers/get-monthly-fuel-consumption.handler';
import { GetTopFuelConsumersHandler } from './queries/handlers/get-top-fuel-consumers.handler';
import { GetFuelKpisHandler } from './queries/handlers/get-fuel-kpis.handler';
import { GetAbnormalFuelConsumptionHandler } from './queries/handlers/get-abnormal-fuel-consumption.handler';

export function registerFuelCqrsHandlers(
  commandBus: CommandBus,
  queryBus: QueryBus
): void {
  // Commands
  commandBus.register(CreateFuelLogCommand, new CreateFuelLogHandler(fuelRepository));
  commandBus.register(UpdateFuelLogCommand, new UpdateFuelLogHandler(fuelRepository));
  commandBus.register(DeleteFuelLogCommand, new DeleteFuelLogHandler(fuelRepository));

  // Queries
  queryBus.register(GetFuelLogsQuery, new GetFuelLogsHandler(fuelRepository));
  queryBus.register(GetFuelLogByIdQuery, new GetFuelLogByIdHandler(fuelRepository));
  queryBus.register(GetFuelStatsQuery, new GetFuelStatsHandler(fuelRepository));
  queryBus.register(GetMonthlyFuelConsumptionQuery, new GetMonthlyFuelConsumptionHandler(fuelRepository));
  queryBus.register(GetTopFuelConsumersQuery, new GetTopFuelConsumersHandler(fuelRepository));
  queryBus.register(GetFuelKpisQuery, new GetFuelKpisHandler(fuelRepository));
  queryBus.register(GetAbnormalFuelConsumptionQuery, new GetAbnormalFuelConsumptionHandler(fuelRepository));
}