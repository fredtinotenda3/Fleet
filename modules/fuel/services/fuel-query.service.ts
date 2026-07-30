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
import { AnalyticsScope, isFleetScope } from '@/shared/types/analytics-scope.types';
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
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope
  ): Promise<FuelStats> {
    return queryBus.execute<FuelStats>(
      new GetFuelStatsQuery(tenantId, dateRange, scope)
    );
  }

  async getMonthlyFuelConsumption(
    tenantId: string,
    months: number = 12,
    scope?: AnalyticsScope
  ): Promise<Array<{ month: string; fuel: number; cost: number }>> {
    return queryBus.execute<Array<{ month: string; fuel: number; cost: number }>>(
      new GetMonthlyFuelConsumptionQuery(tenantId, months, scope)
    );
  }

  async getTopFuelConsumers(
    tenantId: string,
    limit: number = 5,
    scope?: AnalyticsScope
  ): Promise<Array<{ license_plate: string; totalFuel: number; totalCost: number }>> {
    return queryBus.execute<Array<{ license_plate: string; totalFuel: number; totalCost: number }>>(
      new GetTopFuelConsumersQuery(tenantId, limit, scope)
    );
  }

  async getFuelByDriver(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10,
    sortBy: FuelByDriverSort = 'volume',
    scope?: AnalyticsScope
  ): Promise<DriverFuelConsumptionRow[]> {
    return queryBus.execute<DriverFuelConsumptionRow[]>(
      new GetFuelByDriverQuery(tenantId, dateRange, limit, sortBy, scope)
    );
  }

  /**
   * Scope-aware KPI cards. When `scope` is a vehicle scope, the trip
   * distance fallback maps are still computed fleet-wide (trip data has
   * no scope filter here) but only the entries matching the scoped
   * vehicle's license_plate are ever consulted downstream, since
   * FuelRepository.getFuelKpis's own per-vehicle grouping is already
   * narrowed to that single vehicle by the scope-filtered base match --
   * so results are correct for "Vehicle Analytics" without any change to
   * the trip-distance computation itself.
   */
  async getFuelKpis(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope
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
      prevTripDistanceByVehicle,
      scope
    );
  }

  async getAbnormalConsumption(
    tenantId: string,
    threshold: number = 2,
    scope?: AnalyticsScope
  ): Promise<AbnormalFuelConsumptionRow[]> {
    return queryBus.execute<AbnormalFuelConsumptionRow[]>(
      new GetAbnormalFuelConsumptionQuery(tenantId, threshold, scope)
    );
  }

  // ---- Enterprise analytics (all scope-aware) ----

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
    limit: number = 15,
    scope?: AnalyticsScope
  ): Promise<FuelByStationRow[]> {
    return queryBus.execute<FuelByStationRow[]>(
      new GetFuelByStationQuery(tenantId, dateRange, limit, scope)
    );
  }

  async getFuelActivityTrend(
    tenantId: string,
    granularity: FuelTrendGranularity,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope
  ): Promise<FuelActivityTrendPoint[]> {
    return queryBus.execute<FuelActivityTrendPoint[]>(
      new GetFuelActivityTrendQuery(tenantId, granularity, dateRange, scope)
    );
  }

  async getAverageFuelPriceTrend(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    granularity: FuelTrendGranularity = 'month',
    scope?: AnalyticsScope
  ): Promise<FuelPriceTrendPoint[]> {
    return queryBus.execute<FuelPriceTrendPoint[]>(
      new GetAverageFuelPriceTrendQuery(tenantId, dateRange, granularity, scope)
    );
  }

  async getFuelTypeDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope
  ): Promise<FuelTypeDistributionRow[]> {
    return queryBus.execute<FuelTypeDistributionRow[]>(
      new GetFuelTypeDistributionQuery(tenantId, dateRange, scope)
    );
  }

  /**
   * Note: when `scope` is a vehicle scope this necessarily returns at
   * most one row (that vehicle). Left scope-aware anyway rather than
   * special-cased, so the frontend never has to know which charts
   * "don't support" vehicle scope -- the engine just answers correctly
   * either way, per the "every vehicle behaves like a miniature fleet"
   * requirement.
   */
  async getFuelingFrequencyByVehicle(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 20,
    scope?: AnalyticsScope
  ): Promise<FuelFrequencyByVehicleRow[]> {
    return queryBus.execute<FuelFrequencyByVehicleRow[]>(
      new GetFuelingFrequencyByVehicleQuery(tenantId, dateRange, limit, scope)
    );
  }

  async getFuelCostDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope
  ): Promise<FuelCostDistributionBucket[]> {
    return queryBus.execute<FuelCostDistributionBucket[]>(
      new GetFuelCostDistributionQuery(tenantId, dateRange, scope)
    );
  }

  async getFuelEntryHeatmap(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope
  ): Promise<FuelHeatmapCell[]> {
    return queryBus.execute<FuelHeatmapCell[]>(
      new GetFuelEntryHeatmapQuery(tenantId, dateRange, scope)
    );
  }
}

export const fuelQueryService = new FuelQueryService();