// modules/fuel/services/fuel-query.service.ts

import { queryBus } from '@/server/cqrs/query-bus';
import { GetFuelLogsQuery } from '../queries/get-fuel-logs.query';
import { GetFuelLogByIdQuery } from '../queries/get-fuel-log-by-id.query';
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
import type { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import type { FuelByDriverSort } from '../queries/get-fuel-by-driver.query';
import type { VehicleFuelTimelineFilters } from '../queries/get-vehicle-fuel-timeline.query';
import { fuelRepository } from '../repositories/fuel.repository';
import { tripRepository } from '@/modules/trips/repositories/trip.repository';

// FIX (Phase B -- repository/analytics scoping completeness): the 13
// analytics methods below previously routed through queryBus -> a Query
// class -> a Handler that simply forwarded (tenantId, dateRange, scope)
// to the repository, with no `context` anywhere in that chain. Threading
// org-unit scoping through 13 query classes + 13 handlers per domain
// (~100+ files across fuel/expense/trip/maintenance, none of which carry
// business logic beyond a repository passthrough) is disproportionate to
// the fix. Instead these now call the (already org-unit-scoped)
// repository directly, matching the precedent already set by
// `getFuelKpis` below, which never went through queryBus to begin with.
// CRUD/list methods (getFilteredLogs, getFuelLogById) are unchanged and
// still routed through the CQRS bus.
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
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<FuelStats> {
    return fuelRepository.getFuelStats(tenantId, dateRange, scope, context);
  }

  async getMonthlyFuelConsumption(
    tenantId: string,
    months: number = 12,
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<Array<{ month: string; fuel: number; cost: number }>> {
    return fuelRepository.getMonthlyFuelConsumption(tenantId, months, scope, context);
  }

  async getTopFuelConsumers(
    tenantId: string,
    limit: number = 5,
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<Array<{ license_plate: string; totalFuel: number; totalCost: number }>> {
    return fuelRepository.getTopFuelConsumers(tenantId, limit, scope, context);
  }

  async getFuelByDriver(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10,
    sortBy: FuelByDriverSort = 'volume',
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<DriverFuelConsumptionRow[]> {
    return fuelRepository.getFuelByDriver(tenantId, dateRange, limit, sortBy, scope, context);
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
   *
   * `context` (Phase B) is passed to both the trip-distance lookups and
   * the fuel KPI aggregation so branch/department/workshop scoping is
   * applied consistently across both data sources feeding this card.
   */
  async getFuelKpis(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<FuelKpis> {
    const now = new Date();
    const rangeEnd = dateRange?.endDate ?? now;
    const rangeStart = dateRange?.startDate ?? new Date(rangeEnd.getTime() - 90 * 24 * 60 * 60 * 1000);
    const periodMs = rangeEnd.getTime() - rangeStart.getTime();
    const prevRangeEnd = new Date(rangeStart.getTime() - 1);
    const prevRangeStart = new Date(prevRangeEnd.getTime() - periodMs);

    const [tripDistanceByVehicle, prevTripDistanceByVehicle] = await Promise.all([
      tripRepository.getDistanceByVehicle(tenantId, rangeStart, rangeEnd, context),
      tripRepository.getDistanceByVehicle(tenantId, prevRangeStart, prevRangeEnd, context),
    ]);

    return fuelRepository.getFuelKpis(
      tenantId,
      dateRange,
      tripDistanceByVehicle,
      prevTripDistanceByVehicle,
      scope,
      context
    );
  }

  async getAbnormalConsumption(
    tenantId: string,
    threshold: number = 2,
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<AbnormalFuelConsumptionRow[]> {
    return fuelRepository.getAbnormalConsumption(tenantId, threshold, scope, context);
  }

  // ---- Enterprise analytics (all scope-aware) ----

  async getVehicleFuelTimeline(
    tenantId: string,
    filters: VehicleFuelTimelineFilters,
    context?: TenantContext
  ): Promise<VehicleFuelTimelinePoint[]> {
    return fuelRepository.getVehicleFuelTimeline(tenantId, filters, context);
  }

  async getFuelByStation(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 15,
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<FuelByStationRow[]> {
    return fuelRepository.getFuelByStation(tenantId, dateRange, limit, scope, context);
  }

  async getFuelActivityTrend(
    tenantId: string,
    granularity: FuelTrendGranularity,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<FuelActivityTrendPoint[]> {
    return fuelRepository.getFuelActivityTrend(tenantId, granularity, dateRange, scope, context);
  }

  async getAverageFuelPriceTrend(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    granularity: FuelTrendGranularity = 'month',
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<FuelPriceTrendPoint[]> {
    return fuelRepository.getAverageFuelPriceTrend(tenantId, dateRange, granularity, scope, context);
  }

  async getFuelTypeDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<FuelTypeDistributionRow[]> {
    return fuelRepository.getFuelTypeDistribution(tenantId, dateRange, scope, context);
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
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<FuelFrequencyByVehicleRow[]> {
    return fuelRepository.getFuelingFrequencyByVehicle(tenantId, dateRange, limit, scope, context);
  }

  async getFuelCostDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<FuelCostDistributionBucket[]> {
    return fuelRepository.getFuelCostDistribution(tenantId, dateRange, scope, context);
  }

  async getFuelEntryHeatmap(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<FuelHeatmapCell[]> {
    return fuelRepository.getFuelEntryHeatmap(tenantId, dateRange, scope, context);
  }
}

export const fuelQueryService = new FuelQueryService();