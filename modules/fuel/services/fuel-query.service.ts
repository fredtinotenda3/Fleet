/* eslint-disable @typescript-eslint/no-unused-vars */
// modules/fuel/services/fuel-query.service.ts

import { queryBus } from '@/server/cqrs/query-bus';
import { GetFuelLogsQuery } from '../queries/get-fuel-logs.query';
import { GetFuelLogByIdQuery } from '../queries/get-fuel-log-by-id.query';
import { GetFuelStatsQuery } from '../queries/get-fuel-stats.query';
import { GetMonthlyFuelConsumptionQuery } from '../queries/get-monthly-fuel-consumption.query';
import { GetTopFuelConsumersQuery } from '../queries/get-top-fuel-consumers.query';
import { GetFuelKpisQuery } from '../queries/get-fuel-kpis.query';
import { GetAbnormalFuelConsumptionQuery } from '../queries/get-abnormal-fuel-consumption.query';
import { GetFuelByDriverQuery, FuelByDriverSort } from '../queries/get-fuel-by-driver.query';
import { GetVehicleFuelTimelineQuery, VehicleFuelTimelineFilters } from '../queries/get-vehicle-fuel-timeline.query';
import { GetFuelByStationQuery } from '../queries/get-fuel-by-station.query';
import { GetFuelActivityTrendQuery } from '../queries/get-fuel-activity-trend.query';
import { GetAverageFuelPriceTrendQuery } from '../queries/get-average-fuel-price-trend.query';
import { GetFuelTypeDistributionQuery } from '../queries/get-fuel-type-distribution.query';
import { GetFuelingFrequencyByVehicleQuery } from '../queries/get-fueling-frequency-by-vehicle.query';
import { GetFuelCostDistributionQuery } from '../queries/get-fuel-cost-distribution.query';
import { GetFuelEntryHeatmapQuery } from '../queries/get-fuel-entry-heatmap.query';
import {
  FuelLog,
  FuelFilters,
  FuelStats,
  FuelKpis,
  AbnormalFuelConsumptionRow,
  DriverFuelConsumptionRow,
  FuelTrendGranularity,
  VehicleFuelTimelinePoint,
  FuelByStationRow,
  FuelActivityTrendPoint,
  FuelPriceTrendPoint,
  FuelTypeDistributionRow,
  FuelFrequencyByVehicleRow,
  FuelCostDistributionBucket,
  FuelHeatmapCell,
} from '@/shared/types/fuel.types';
import { PaginatedResponse, PaginationParams } from '@/shared/types/common.types';
import { fuelRepository } from '../repositories/fuel.repository';
import { tripRepository } from '@/modules/trips/repositories/trip.repository';

export class FuelQueryService {
  async getFilteredLogs(
    filters: FuelFilters,
    pagination: PaginationParams,
    tenantId: string
  ): Promise<PaginatedResponse<FuelLog>> {
    return queryBus.execute<PaginatedResponse<FuelLog>>(
      new GetFuelLogsQuery(filters, pagination, tenantId)
    );
  }

  async getFuelLogById(fuelLogId: string, tenantId: string): Promise<FuelLog> {
    return queryBus.execute<FuelLog>(
      new GetFuelLogByIdQuery(fuelLogId, tenantId)
    );
  }

  async getFuelStats(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelStats> {
    return queryBus.execute<FuelStats>(
      new GetFuelStatsQuery(tenantId, dateRange)
    );
  }

  async getMonthlyFuelConsumption(
    tenantId: string,
    months: number = 12
  ): Promise<Array<{ month: string; fuel: number; cost: number }>> {
    return queryBus.execute<Array<{ month: string; fuel: number; cost: number }>>(
      new GetMonthlyFuelConsumptionQuery(tenantId, months)
    );
  }

  async getTopFuelConsumers(
    tenantId: string,
    limit: number = 5
  ): Promise<Array<{ license_plate: string; totalFuel: number; totalCost: number }>> {
    return queryBus.execute<Array<{ license_plate: string; totalFuel: number; totalCost: number }>>(
      new GetTopFuelConsumersQuery(tenantId, limit)
    );
  }

  async getFuelByDriver(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10,
    sortBy: FuelByDriverSort = 'volume'
  ): Promise<DriverFuelConsumptionRow[]> {
    return queryBus.execute<DriverFuelConsumptionRow[]>(
      new GetFuelByDriverQuery(tenantId, dateRange, limit, sortBy)
    );
  }

  async getFuelKpis(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelKpis> {
    const now = new Date();
    const rangeEnd = dateRange?.endDate ?? now;
    const rangeStart = dateRange?.startDate ?? new Date(rangeEnd.getTime() - 90 * 24 * 60 * 60 * 1000);
    const periodMs = rangeEnd.getTime() - rangeStart.getTime();
    const prevRangeEnd = new Date(rangeStart.getTime() - 1);
    const prevRangeStart = new Date(prevRangeEnd.getTime() - periodMs);

    const [tripDistanceByVehicle, prevTripDistanceByVehicle] = await Promise.all([
      tripRepository.getDistanceByVehicle(tenantId, rangeStart, rangeEnd),
      tripRepository.getDistanceByVehicle(tenantId, prevRangeStart, prevRangeEnd),
    ]);

    return fuelRepository.getFuelKpis(
      tenantId,
      dateRange,
      tripDistanceByVehicle,
      prevTripDistanceByVehicle
    );
  }

  async getAbnormalConsumption(
    tenantId: string,
    threshold: number = 2
  ): Promise<AbnormalFuelConsumptionRow[]> {
    return queryBus.execute<AbnormalFuelConsumptionRow[]>(
      new GetAbnormalFuelConsumptionQuery(tenantId, threshold)
    );
  }

  // ---- Enterprise analytics ----

  async getVehicleFuelTimeline(
    tenantId: string,
    filters: VehicleFuelTimelineFilters
  ): Promise<VehicleFuelTimelinePoint[]> {
    return queryBus.execute<VehicleFuelTimelinePoint[]>(
      new GetVehicleFuelTimelineQuery(tenantId, filters)
    );
  }

  async getFuelByStation(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 15
  ): Promise<FuelByStationRow[]> {
    return queryBus.execute<FuelByStationRow[]>(
      new GetFuelByStationQuery(tenantId, dateRange, limit)
    );
  }

  async getFuelActivityTrend(
    tenantId: string,
    granularity: FuelTrendGranularity,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelActivityTrendPoint[]> {
    return queryBus.execute<FuelActivityTrendPoint[]>(
      new GetFuelActivityTrendQuery(tenantId, granularity, dateRange)
    );
  }

  async getAverageFuelPriceTrend(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    granularity: FuelTrendGranularity = 'month'
  ): Promise<FuelPriceTrendPoint[]> {
    return queryBus.execute<FuelPriceTrendPoint[]>(
      new GetAverageFuelPriceTrendQuery(tenantId, dateRange, granularity)
    );
  }

  async getFuelTypeDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelTypeDistributionRow[]> {
    return queryBus.execute<FuelTypeDistributionRow[]>(
      new GetFuelTypeDistributionQuery(tenantId, dateRange)
    );
  }

  async getFuelingFrequencyByVehicle(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 20
  ): Promise<FuelFrequencyByVehicleRow[]> {
    return queryBus.execute<FuelFrequencyByVehicleRow[]>(
      new GetFuelingFrequencyByVehicleQuery(tenantId, dateRange, limit)
    );
  }

  async getFuelCostDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelCostDistributionBucket[]> {
    return queryBus.execute<FuelCostDistributionBucket[]>(
      new GetFuelCostDistributionQuery(tenantId, dateRange)
    );
  }

  async getFuelEntryHeatmap(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelHeatmapCell[]> {
    return queryBus.execute<FuelHeatmapCell[]>(
      new GetFuelEntryHeatmapQuery(tenantId, dateRange)
    );
  }
}

export const fuelQueryService = new FuelQueryService();