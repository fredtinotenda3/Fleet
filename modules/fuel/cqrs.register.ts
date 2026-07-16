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
import { GetFuelByDriverQuery } from './queries/get-fuel-by-driver.query';
import { GetVehicleFuelTimelineQuery } from './queries/get-vehicle-fuel-timeline.query';
import { GetFuelByStationQuery } from './queries/get-fuel-by-station.query';
import { GetFuelActivityTrendQuery } from './queries/get-fuel-activity-trend.query';
import { GetAverageFuelPriceTrendQuery } from './queries/get-average-fuel-price-trend.query';
import { GetFuelTypeDistributionQuery } from './queries/get-fuel-type-distribution.query';
import { GetFuelingFrequencyByVehicleQuery } from './queries/get-fueling-frequency-by-vehicle.query';
import { GetFuelCostDistributionQuery } from './queries/get-fuel-cost-distribution.query';
import { GetFuelEntryHeatmapQuery } from './queries/get-fuel-entry-heatmap.query';

import { GetFuelLogsHandler } from './queries/handlers/get-fuel-logs.handler';
import { GetFuelLogByIdHandler } from './queries/handlers/get-fuel-log-by-id.handler';
import { GetFuelStatsHandler } from './queries/handlers/get-fuel-stats.handler';
import { GetMonthlyFuelConsumptionHandler } from './queries/handlers/get-monthly-fuel-consumption.handler';
import { GetTopFuelConsumersHandler } from './queries/handlers/get-top-fuel-consumers.handler';
import { GetFuelKpisHandler } from './queries/handlers/get-fuel-kpis.handler';
import { GetAbnormalFuelConsumptionHandler } from './queries/handlers/get-abnormal-fuel-consumption.handler';
import { GetFuelByDriverHandler } from './queries/handlers/get-fuel-by-driver.handler';
import { GetVehicleFuelTimelineHandler } from './queries/handlers/get-vehicle-fuel-timeline.handler';
import { GetFuelByStationHandler } from './queries/handlers/get-fuel-by-station.handler';
import { GetFuelActivityTrendHandler } from './queries/handlers/get-fuel-activity-trend.handler';
import { GetAverageFuelPriceTrendHandler } from './queries/handlers/get-average-fuel-price-trend.handler';
import { GetFuelTypeDistributionHandler } from './queries/handlers/get-fuel-type-distribution.handler';
import { GetFuelingFrequencyByVehicleHandler } from './queries/handlers/get-fueling-frequency-by-vehicle.handler';
import { GetFuelCostDistributionHandler } from './queries/handlers/get-fuel-cost-distribution.handler';
import { GetFuelEntryHeatmapHandler } from './queries/handlers/get-fuel-entry-heatmap.handler';

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
  queryBus.register(GetFuelByDriverQuery, new GetFuelByDriverHandler(fuelRepository));

  // NEW -- enterprise analytics
  queryBus.register(GetVehicleFuelTimelineQuery, new GetVehicleFuelTimelineHandler(fuelRepository));
  queryBus.register(GetFuelByStationQuery, new GetFuelByStationHandler(fuelRepository));
  queryBus.register(GetFuelActivityTrendQuery, new GetFuelActivityTrendHandler(fuelRepository));
  queryBus.register(GetAverageFuelPriceTrendQuery, new GetAverageFuelPriceTrendHandler(fuelRepository));
  queryBus.register(GetFuelTypeDistributionQuery, new GetFuelTypeDistributionHandler(fuelRepository));
  queryBus.register(
    GetFuelingFrequencyByVehicleQuery,
    new GetFuelingFrequencyByVehicleHandler(fuelRepository)
  );
  queryBus.register(GetFuelCostDistributionQuery, new GetFuelCostDistributionHandler(fuelRepository));
  queryBus.register(GetFuelEntryHeatmapQuery, new GetFuelEntryHeatmapHandler(fuelRepository));
}