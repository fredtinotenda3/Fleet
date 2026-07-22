// modules/fuel/repositories/fuel.repository.ts

import { BaseRepository } from '@/server/repositories/base.repository';
import {
  FuelLog,
  FuelFilters,
  FuelStats,
  FuelKpis,
  AbnormalFuelConsumptionRow,
  FuelPaymentMethod,
  FuelPaymentBreakdown,
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
import {
  PaginationParams,
  PaginatedResponse,
} from '@/shared/types/common.types';
import { Filter, ObjectId } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';

interface VehiclePeriodAggregate {
  _id: string;
  minOdometer?: number;
  maxOdometer?: number;
  totalFuel: number;
  totalCost: number;
  count: number;
  avgVolume: number;
}

const ALL_PAYMENT_METHODS: FuelPaymentMethod[] = ['cash', 'fuel_card', 'credit_card', 'company_account', 'other'];

export const DEFAULT_ABNORMAL_CONSUMPTION_MULTIPLIER = 2;

export class FuelRepository extends BaseRepository<FuelLog> {
  protected collectionName = 'tblfuellogs';

  private isSuperAdminTenant(tenantId: string): boolean {
    return (
      tenantId === 'default' ||
      tenantId === 'system' ||
      tenantId === 'super_admin'
    );
  }

  /** Shared tenant + date-range match stage builder used by every analytics aggregation below. */
  private buildBaseMatch(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Record<string, unknown> {
    const match: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (!this.isSuperAdminTenant(tenantId)) match.tenantId = tenantId;
    if (dateRange?.startDate || dateRange?.endDate) {
      match.date = {};
      if (dateRange.startDate) (match.date as any).$gte = dateRange.startDate;
      if (dateRange.endDate) (match.date as any).$lte = dateRange.endDate;
    }
    return match;
  }

  /**
   * Single source of truth for period bucketing, shared by getFuelActivityTrend
   * and getAverageFuelPriceTrend so the two charts can never disagree about
   * what a "week"/"quarter" boundary is.
   */
  private buildPeriodExpr(granularity: FuelTrendGranularity): Record<string, unknown> {
    switch (granularity) {
      case 'week':
        return { $dateToString: { format: '%G-W%V', date: '$date' } };
      case 'quarter':
        return {
          $concat: [
            { $toString: { $year: '$date' } },
            '-Q',
            { $toString: { $ceil: { $divide: [{ $month: '$date' }, 3] } } },
          ],
        };
      case 'year':
        return { $dateToString: { format: '%Y', date: '$date' } };
      case 'month':
      default:
        return { $dateToString: { format: '%Y-%m', date: '$date' } };
    }
  }

  private async enrichFuelLogs(logs: FuelLog[]): Promise<FuelLog[]> {
    const driverIds = Array.from(
      new Set(logs.map((l) => l.driver_id).filter((id): id is string => Boolean(id)))
    );
    const stationIds = Array.from(
      new Set(logs.map((l) => l.fuel_station_id).filter((id): id is string => Boolean(id)))
    );

    if (driverIds.length === 0 && stationIds.length === 0) return logs;

    const db = await connectToDatabase();

    const driverMap = new Map<string, { _id: string; name: string; driver_code?: string }>();
    const validDriverObjectIds = driverIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    if (validDriverObjectIds.length > 0) {
      const drivers = await db
        .collection('tbldrivers')
        .find({ _id: { $in: validDriverObjectIds } }, { projection: { name: 1, driver_code: 1 } })
        .toArray();
      for (const d of drivers) {
        driverMap.set(String(d._id), {
          _id: String(d._id),
          name: d.name as string,
          driver_code: d.driver_code as string | undefined,
        });
      }
    }

    const stationMap = new Map<string, { _id: string; name: string; brand?: string }>();
    const validStationObjectIds = stationIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    if (validStationObjectIds.length > 0) {
      const stations = await db
        .collection('tblfuelstations')
        .find({ _id: { $in: validStationObjectIds } }, { projection: { name: 1, brand: 1 } })
        .toArray();
      for (const s of stations) {
        stationMap.set(String(s._id), {
          _id: String(s._id),
          name: s.name as string,
          brand: s.brand as string | undefined,
        });
      }
    }

    if (driverMap.size === 0 && stationMap.size === 0) return logs;

    return logs.map((log) => {
      let enriched = log;
      if (log.driver_id) {
        const driver = driverMap.get(log.driver_id);
        if (driver) enriched = { ...enriched, driver };
      }
      if (log.fuel_station_id) {
        const station = stationMap.get(log.fuel_station_id);
        if (station) enriched = { ...enriched, fuel_station: station };
      }
      return enriched;
    });
  }

  async findByLicensePlate(
    licensePlate: string,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<FuelLog>> {
    const result = await this.findWithPagination(
      { license_plate: licensePlate.toUpperCase() } as Filter<FuelLog>,
      pagination,
      tenantId
    );
    return { ...result, data: await this.enrichFuelLogs(result.data) };
  }

  async getFilteredLogs(
    filters: FuelFilters,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<FuelLog>> {
    const filter: Record<string, unknown> = {};

    if (filters.license_plate) {
      filter.license_plate = { $regex: filters.license_plate, $options: 'i' };
    }
    if (filters.unit_id) filter.unit_id = filters.unit_id;
    if (filters.payment_method) filter.payment_method = filters.payment_method;
    if (filters.fuel_station_id) filter.fuel_station_id = filters.fuel_station_id;
    if (filters.fuel_card_id) filter.fuel_card_id = filters.fuel_card_id;
    if (filters.driver_id) filter.driver_id = filters.driver_id;
    if (filters.startDate || filters.endDate) {
      filter.date = {};
      if (filters.startDate) (filter.date as any).$gte = filters.startDate;
      if (filters.endDate) (filter.date as any).$lte = filters.endDate;
    }

    const result = await this.findWithPagination(filter as Filter<FuelLog>, pagination, tenantId);
    return { ...result, data: await this.enrichFuelLogs(result.data) };
  }

  /**
   * Org/branch-scoped variant of getFilteredLogs. Mirrors
   * VehicleRepository.getFilteredVehiclesInScope: same filters, plus
   * tenantScopeService.buildFilter(context, 'orgUnitId') on top of (not
   * instead of) tenant isolation.
   */
  async getFilteredLogsInScope(
    filters: FuelFilters,
    context: TenantContext,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<FuelLog>> {
    const collection = await this.getCollection();

    const query: Record<string, unknown> = {
      isDeleted: { $ne: true },
    };

    if (!this.isSuperAdminTenant(context.organizationId)) {
      query.tenantId = context.organizationId;
    }

    if (filters.license_plate) {
      query.license_plate = { $regex: filters.license_plate, $options: 'i' };
    }
    if (filters.unit_id) query.unit_id = filters.unit_id;
    if (filters.payment_method) query.payment_method = filters.payment_method;
    if (filters.fuel_station_id) query.fuel_station_id = filters.fuel_station_id;
    if (filters.fuel_card_id) query.fuel_card_id = filters.fuel_card_id;
    if (filters.driver_id) query.driver_id = filters.driver_id;
    if (filters.startDate || filters.endDate) {
      query.date = {};
      if (filters.startDate) (query.date as any).$gte = filters.startDate;
      if (filters.endDate) (query.date as any).$lte = filters.endDate;
    }

    const scopeFilter = tenantScopeService.buildFilter<FuelLog>(context, 'orgUnitId');
    Object.assign(query, scopeFilter);

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      collection
        .find(query as Filter<FuelLog>)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments(query as Filter<FuelLog>),
    ]);

    const result = {
      data: data as FuelLog[],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };

    return { ...result, data: await this.enrichFuelLogs(result.data) };
  }

  async findById(id: string, tenantId: string): Promise<FuelLog | null> {
    const log = await super.findById(id, tenantId);
    if (!log) return null;
    const [enriched] = await this.enrichFuelLogs([log]);
    return enriched;
  }

  async getFuelStats(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelStats> {
    const collection = await this.getCollection();
    const filter = this.buildBaseMatch(tenantId, dateRange);

    const pipeline = [
      { $match: filter },
      {
        $facet: {
          total: [
            {
              $group: {
                _id: null,
                totalFuel: { $sum: '$fuel_volume' },
                totalCost: { $sum: '$cost' },
                count: { $sum: 1 },
              },
            },
          ],
          byPayment: [
            {
              $group: {
                _id: { $ifNull: ['$payment_method', 'cash'] },
                totalCost: { $sum: '$cost' },
                totalVolume: { $sum: '$fuel_volume' },
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ];

    const result = await collection.aggregate(pipeline).toArray();
    const data = result[0]?.total[0] || { totalFuel: 0, totalCost: 0, count: 0 };
    const byPayment = (result[0]?.byPayment || []) as Array<{
      _id: FuelPaymentMethod;
      totalCost: number;
      totalVolume: number;
      count: number;
    }>;

    const breakdownMap = new Map(byPayment.map((row) => [row._id, row]));
    const paymentBreakdown: FuelPaymentBreakdown[] = ALL_PAYMENT_METHODS.map((method) => {
      const row = breakdownMap.get(method);
      return {
        method,
        totalCost: row?.totalCost ?? 0,
        totalVolume: row?.totalVolume ?? 0,
        count: row?.count ?? 0,
      };
    }).filter((row) => row.count > 0);

    return {
      totalFuel: data.totalFuel,
      totalCost: data.totalCost,
      averageCostPerUnit: data.totalFuel > 0 ? data.totalCost / data.totalFuel : 0,
      logCount: data.count,
      efficiency: null,
      paymentBreakdown,
    };
  }

  async getMonthlyFuelConsumption(
    tenantId: string,
    months: number = 12
  ): Promise<Array<{ month: string; fuel: number; cost: number }>> {
    const collection = await this.getCollection();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    const matchStage = this.buildBaseMatch(tenantId, { startDate });

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
          fuel: { $sum: '$fuel_volume' },
          cost: { $sum: '$cost' },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({ month: r._id, fuel: r.fuel, cost: r.cost }));
  }

  async getTopFuelConsumers(
    tenantId: string,
    limit: number = 5
  ): Promise<Array<{ license_plate: string; totalFuel: number; totalCost: number }>> {
    const collection = await this.getCollection();
    const matchStage = this.buildBaseMatch(tenantId);

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$license_plate',
          totalFuel: { $sum: '$fuel_volume' },
          totalCost: { $sum: '$cost' },
        },
      },
      { $sort: { totalFuel: -1 } },
      { $limit: limit },
      { $project: { license_plate: '$_id', totalFuel: 1, totalCost: 1, _id: 0 } },
    ];

    return collection.aggregate(pipeline).toArray() as Promise<
  { license_plate: string; totalFuel: number; totalCost: number }[]
>;
  }

  /**
   * "Fuel Consumption by Driver" / "Fuel Cost by Driver" (enterprise spec #2)
   * -- same aggregation, `sortBy` picks which figure ranks the result so we
   * don't stand up a second near-identical pipeline for the dashboard's
   * existing widget vs. the new enterprise chart.
   *
   * FIX (root cause of duplicate/fragmented "Unassigned" rows): the group
   * key previously used `$ifNull: ['$driver_id', null]`, which does NOT
   * treat an empty-string driver_id ("") as absent -- only true null/missing
   * is caught by $ifNull. Since "" is truthy in Mongo aggregation, rows with
   * driver_id === "" formed their own group distinct from true-null rows,
   * producing two separate "Unassigned" entries in the output instead of
   * one merged total. Normalized both null and "" to a single `null` key
   * via $addFields before grouping so unattributed fuel logs are always
   * merged into exactly one bucket.
   */
  async getFuelByDriver(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10,
    sortBy: 'volume' | 'cost' = 'volume'
  ): Promise<DriverFuelConsumptionRow[]> {
    const collection = await this.getCollection();
    const matchStage = this.buildBaseMatch(tenantId, dateRange);
    const sortField = sortBy === 'cost' ? 'totalCost' : 'totalFuel';

    const pipeline = [
      { $match: matchStage },
      {
        $addFields: {
          __driverKey: {
            $cond: [
              { $and: [{ $ne: ['$driver_id', null] }, { $ne: ['$driver_id', ''] }] },
              '$driver_id',
              null,
            ],
          },
        },
      },
      {
        $group: {
          _id: '$__driverKey',
          totalFuel: { $sum: '$fuel_volume' },
          totalCost: { $sum: '$cost' },
          count: { $sum: 1 },
          vehicles: { $addToSet: '$license_plate' },
        },
      },
      { $sort: { [sortField]: -1 } },
      { $limit: limit },
    ];

    const grouped = await collection.aggregate(pipeline).toArray();

    const driverIds = grouped
      .map((g) => g._id)
      .filter((id): id is string => Boolean(id) && ObjectId.isValid(id));

    let driverNameMap = new Map<string, string>();
    if (driverIds.length > 0) {
      const db = await connectToDatabase();
      const drivers = await db
        .collection('tbldrivers')
        .find({ _id: { $in: driverIds.map((id) => new ObjectId(id)) } }, { projection: { name: 1 } })
        .toArray();
      driverNameMap = new Map(drivers.map((d) => [String(d._id), d.name as string]));
    }

    return grouped.map((g) => {
      const driverId: string | null = g._id ?? null;
      return {
        driver_id: driverId,
        driverName: driverId ? driverNameMap.get(driverId) ?? 'Unknown driver' : 'Unassigned',
        totalFuel: g.totalFuel,
        totalCost: g.totalCost,
        logCount: g.count,
        vehicleCount: Array.isArray(g.vehicles) ? g.vehicles.length : 0,
        averageCostPerUnit: g.totalFuel > 0 ? g.totalCost / g.totalFuel : 0,
      };
    });
  }

  async getFuelKpis(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    tripDistanceByVehicle?: Record<string, number>,
    prevTripDistanceByVehicle?: Record<string, number>
  ): Promise<FuelKpis> {
    const collection = await this.getCollection();
    const now = new Date();

    const rangeEnd = dateRange?.endDate ?? now;
    const rangeStart = dateRange?.startDate ?? new Date(rangeEnd.getTime() - 90 * 24 * 60 * 60 * 1000);
    const periodMs = rangeEnd.getTime() - rangeStart.getTime();
    const prevRangeEnd = new Date(rangeStart.getTime() - 1);
    const prevRangeStart = new Date(prevRangeEnd.getTime() - periodMs);

    const baseMatch = this.buildBaseMatch(tenantId);

    const aggregateByVehicle = async (start: Date, end: Date): Promise<VehiclePeriodAggregate[]> => {
      const pipeline = [
        { $match: { ...baseMatch, date: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: '$license_plate',
            minOdometer: { $min: '$odometer' },
            maxOdometer: { $max: '$odometer' },
            totalFuel: { $sum: '$fuel_volume' },
            totalCost: { $sum: '$cost' },
            count: { $sum: 1 },
            avgVolume: { $avg: '$fuel_volume' },
          },
        },
      ];
      return collection.aggregate(pipeline).toArray() as Promise<VehiclePeriodAggregate[]>;
    };

    const [currentByVehicle, previousByVehicle, recentLogs] = await Promise.all([
      aggregateByVehicle(rangeStart, rangeEnd),
      aggregateByVehicle(prevRangeStart, prevRangeEnd),
      collection.find({ ...baseMatch, date: { $gte: rangeStart, $lte: rangeEnd } }).sort({ date: -1 }).toArray(),
    ]);

    const summarize = (
      byVehicle: VehiclePeriodAggregate[],
      distanceFallback?: Record<string, number>
    ) => {
      let totalDistance = 0;
      let totalFuel = 0;
      let totalCost = 0;
      let fallbackVehicleCount = 0;
      const fallbackPlates: string[] = [];

      for (const v of byVehicle) {
        totalFuel += v.totalFuel || 0;
        totalCost += v.totalCost || 0;

        let vehicleDistance = 0;
        const hasOdometerRange =
          typeof v.minOdometer === 'number' &&
          typeof v.maxOdometer === 'number' &&
          v.maxOdometer > v.minOdometer;

        if (hasOdometerRange) {
          vehicleDistance = (v.maxOdometer as number) - (v.minOdometer as number);
        }

        if (vehicleDistance <= 0 && distanceFallback && distanceFallback[v._id]) {
          vehicleDistance = distanceFallback[v._id];
          fallbackVehicleCount += 1;
          fallbackPlates.push(v._id);
        }

        totalDistance += vehicleDistance;
      }

      const efficiency = totalFuel > 0 ? totalDistance / totalFuel : 0;
      const costPerKm = totalDistance > 0 ? totalCost / totalDistance : 0;
      return { totalDistance, totalFuel, totalCost, efficiency, costPerKm, fallbackVehicleCount, fallbackPlates };
    };

    const current = summarize(currentByVehicle, tripDistanceByVehicle);
    const previous = summarize(previousByVehicle, prevTripDistanceByVehicle);

    const vehicleAvgVolume = new Map<string, number>();
    currentByVehicle.forEach((v) => vehicleAvgVolume.set(v._id, v.avgVolume || 0));

    let abnormalCount = 0;
    for (const log of recentLogs) {
      const avg = vehicleAvgVolume.get(log.license_plate) || 0;
      if (avg > 0 && log.fuel_volume > avg * DEFAULT_ABNORMAL_CONSUMPTION_MULTIPLIER) abnormalCount += 1;
    }
    const abnormalConsumptionPercentage =
      recentLogs.length > 0 ? Math.round((abnormalCount / recentLogs.length) * 1000) / 10 : 0;

    const mostRecent = recentLogs[0];
    const daysSinceLastFill = mostRecent
      ? Math.max(0, Math.floor((now.getTime() - new Date(mostRecent.date).getTime()) / (24 * 60 * 60 * 1000)))
      : 0;

    return {
      averageFuelEfficiency: Math.round(current.efficiency * 100) / 100,
      totalDistance: Math.round(current.totalDistance),
      efficiencyTrend: Math.round((current.efficiency - previous.efficiency) * 100) / 100,
      costPerKm: Math.round(current.costPerKm * 100) / 100,
      costTrend: Math.round((current.costPerKm - previous.costPerKm) * 100) / 100,
      vehiclesTracked: currentByVehicle.length,
      abnormalConsumptionCount: abnormalCount,
      abnormalConsumptionPercentage,
      daysSinceLastFill,
      mostRecentVehicle: mostRecent?.station_name,
      mostRecentPlate: mostRecent?.license_plate,
      fallbackVehicleCount: current.fallbackVehicleCount,
      fallbackPlates: current.fallbackPlates,
    };
  }

  async getAbnormalConsumption(
    tenantId: string,
    threshold: number = DEFAULT_ABNORMAL_CONSUMPTION_MULTIPLIER
  ): Promise<AbnormalFuelConsumptionRow[]> {
    const collection = await this.getCollection();
    const matchStage = this.buildBaseMatch(tenantId);

    const pipeline = [
      { $match: matchStage },
      { $group: { _id: '$license_plate', avgVolume: { $avg: '$fuel_volume' }, logs: { $push: '$$ROOT' } } },
    ];

    const grouped = await collection.aggregate(pipeline).toArray();
    const rows: AbnormalFuelConsumptionRow[] = [];

    for (const group of grouped) {
      const avg = group.avgVolume || 0;
      if (avg <= 0) continue;
      for (const log of group.logs) {
        if (log.fuel_volume > avg * threshold) {
          rows.push({
            _id: String(log._id),
            license_plate: log.license_plate,
            volume: log.fuel_volume,
            station_name: log.station_name,
            date: log.date,
            anomalyScore: Math.round((log.fuel_volume / avg) * 100) / 100,
            threshold,
          });
        }
      }
    }

    return rows
      .sort((a, b) => new Date(b.date as string).getTime() - new Date(a.date as string).getTime())
      .slice(0, 50);
  }

  // ------------------------------------------------------------------
  // Enterprise analytics additions (Fuel Analytics Enhancement)
  // ------------------------------------------------------------------

  /** #1 Vehicle Fuel Activity Timeline -- entries per day, optionally scoped to one vehicle. */
  async getVehicleFuelTimeline(
    tenantId: string,
    filters: { license_plate?: string; startDate?: Date; endDate?: Date }
  ): Promise<VehicleFuelTimelinePoint[]> {
    const collection = await this.getCollection();
    const matchStage = this.buildBaseMatch(tenantId, filters);
    if (filters.license_plate) {
      matchStage.license_plate = filters.license_plate.toUpperCase();
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          count: { $sum: 1 },
          volume: { $sum: '$fuel_volume' },
          cost: { $sum: '$cost' },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({
      date: r._id,
      count: r.count,
      volume: Math.round((r.volume || 0) * 100) / 100,
      cost: Math.round((r.cost || 0) * 100) / 100,
    }));
  }

  /**
   * #4 Fuel Spend by Station + #8 Top Fuel Stations -- one grouped
   * aggregation keyed by fuel_station_id (falling back to the free-text
   * station_name for unregistered entries), resolving registered station
   * names in a single batched follow-up query. Callers sort the returned
   * rows by totalSpend or visits depending on which chart is rendering.
   *
   * FIX (root cause of "Unregistered station" mislabeling): the previous
   * `_id`/`isRegistered` computation used `$ifNull: ['$fuel_station_id', ...]`
   * and `$cond: [{ $ifNull: ['$fuel_station_id', false] }, true, false]`.
   * $ifNull only catches true null/missing -- an empty-string fuel_station_id
   * ("", the value a controlled <Select> submits when nothing is chosen)
   * is truthy in Mongo's $cond, so those rows were incorrectly marked
   * isRegistered=true with an unresolvable _id of "", which then failed
   * ObjectId.isValid() downstream and fell through to a generic fallback
   * instead of the real station name. Normalized both fuel_station_id and
   * station_name via $addFields (treating null AND "" as absent) before
   * grouping, so registered/unregistered detection and the display name
   * are computed consistently.
   */
  async getFuelByStation(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 15
  ): Promise<FuelByStationRow[]> {
    const collection = await this.getCollection();
    const matchStage = this.buildBaseMatch(tenantId, dateRange);

    const pipeline = [
      { $match: matchStage },
      {
        $addFields: {
          __hasStationId: {
            $and: [{ $ne: ['$fuel_station_id', null] }, { $ne: ['$fuel_station_id', ''] }],
          },
          __hasStationName: {
            $and: [{ $ne: ['$station_name', null] }, { $ne: ['$station_name', ''] }],
          },
        },
      },
      {
        $group: {
          _id: {
            $cond: [
              '$__hasStationId',
              '$fuel_station_id',
              { $cond: ['$__hasStationName', '$station_name', 'Unregistered station'] },
            ],
          },
          isRegistered: { $max: '$__hasStationId' },
          fallbackName: { $first: '$station_name' },
          totalSpend: { $sum: '$cost' },
          totalLitres: { $sum: '$fuel_volume' },
          visits: { $sum: 1 },
        },
      },
      { $sort: { totalSpend: -1 } },
      { $limit: Math.max(limit, 50) }, // fetch a wider pool so callers can re-sort by visits client-side
    ];

    const grouped = await collection.aggregate(pipeline).toArray();

    const stationIds = grouped
      .filter((g) => g.isRegistered && ObjectId.isValid(g._id))
      .map((g) => new ObjectId(g._id));

    let stationNameMap = new Map<string, string>();
    if (stationIds.length > 0) {
      const db = await connectToDatabase();
      const stations = await db
        .collection('tblfuelstations')
        .find({ _id: { $in: stationIds } }, { projection: { name: 1 } })
        .toArray();
      stationNameMap = new Map(stations.map((s) => [String(s._id), s.name as string]));
    }

    return grouped.map((g) => ({
      station_id: g.isRegistered ? String(g._id) : null,
      stationName: g.isRegistered
        ? stationNameMap.get(String(g._id)) ?? 'Unknown station'
        : (g.fallbackName && String(g.fallbackName).trim()) || 'Unregistered station',
      totalSpend: Math.round(g.totalSpend * 100) / 100,
      totalLitres: Math.round(g.totalLitres * 100) / 100,
      visits: g.visits,
    }));
  }

  /** #3 Fuel Activity Trend -- entries (bar) + volume/cost/avg-price (switchable line), by period. */
  async getFuelActivityTrend(
    tenantId: string,
    granularity: FuelTrendGranularity,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelActivityTrendPoint[]> {
    const collection = await this.getCollection();
    const matchStage = this.buildBaseMatch(tenantId, dateRange);

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: this.buildPeriodExpr(granularity),
          entries: { $sum: 1 },
          volume: { $sum: '$fuel_volume' },
          cost: { $sum: '$cost' },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({
      period: r._id,
      entries: r.entries,
      volume: Math.round(r.volume * 100) / 100,
      cost: Math.round(r.cost * 100) / 100,
      avgCostPerLitre: r.volume > 0 ? Math.round((r.cost / r.volume) * 100) / 100 : 0,
    }));
  }

  /** #5 Average Fuel Price Trend -- weighted (totalCost/totalVolume) average per period. */
  async getAverageFuelPriceTrend(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    granularity: FuelTrendGranularity = 'month'
  ): Promise<FuelPriceTrendPoint[]> {
    const collection = await this.getCollection();
    const matchStage = this.buildBaseMatch(tenantId, dateRange);

    const pipeline = [
      { $match: { ...matchStage, fuel_volume: { $gt: 0 } } },
      {
        $group: {
          _id: this.buildPeriodExpr(granularity),
          totalCost: { $sum: '$cost' },
          totalVolume: { $sum: '$fuel_volume' },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({
      period: r._id,
      avgCostPerLitre: r.totalVolume > 0 ? Math.round((r.totalCost / r.totalVolume) * 100) / 100 : 0,
    }));
  }

  /** #6 Fuel Type Distribution -- litres/cost/percentage per fuel_type. */
  async getFuelTypeDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelTypeDistributionRow[]> {
    const collection = await this.getCollection();
    const matchStage = this.buildBaseMatch(tenantId, dateRange);

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: { $ifNull: ['$fuel_type', 'unspecified'] },
          litres: { $sum: '$fuel_volume' },
          cost: { $sum: '$cost' },
        },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    const totalLitres = results.reduce((sum, r) => sum + r.litres, 0);

    return results
      .map((r) => ({
        fuelType: r._id as string,
        litres: Math.round(r.litres * 100) / 100,
        cost: Math.round(r.cost * 100) / 100,
        percentage: totalLitres > 0 ? Math.round((r.litres / totalLitres) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.litres - a.litres);
  }

  /** #7 Fueling Frequency by Vehicle -- entry count + volume/cost totals per license plate. */
  async getFuelingFrequencyByVehicle(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 20
  ): Promise<FuelFrequencyByVehicleRow[]> {
    const collection = await this.getCollection();
    const matchStage = this.buildBaseMatch(tenantId, dateRange);

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$license_plate',
          count: { $sum: 1 },
          totalVolume: { $sum: '$fuel_volume' },
          totalCost: { $sum: '$cost' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit },
      {
        $project: {
          license_plate: '$_id',
          count: 1,
          totalVolume: { $round: [{ $ifNull: ['$totalVolume', 0] }, 2] },
          totalCost: { $round: [{ $ifNull: ['$totalCost', 0] }, 2] },
          _id: 0,
        },
      },
    ];

    return collection.aggregate(pipeline).toArray() as Promise<FuelFrequencyByVehicleRow[]>;
  }

  /** #9 Fuel Cost Distribution -- histogram buckets via $bucketAuto (server picks even boundaries). */
  async getFuelCostDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelCostDistributionBucket[]> {
    const collection = await this.getCollection();
    const matchStage = this.buildBaseMatch(tenantId, dateRange);

    const count = await collection.countDocuments(matchStage as Filter<FuelLog>);
    if (count === 0) return [];

    const bucketCount = Math.min(8, count);
    const pipeline = [
      { $match: matchStage },
      {
        $bucketAuto: {
          groupBy: '$cost',
          buckets: bucketCount,
          output: { count: { $sum: 1 } },
        },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({
      min: Math.round((r._id.min ?? 0) * 100) / 100,
      max: Math.round((r._id.max ?? 0) * 100) / 100,
      count: r.count,
    }));
  }

  /**
   * #10 Fuel Entry Heatmap -- day-of-week x hour-of-day entry counts.
   * Note: entries logged via the date-only form input default to midnight,
   * so the hour dimension is only meaningful for records that carry a real
   * timestamp (e.g. imported data with full datetimes).
   */
  async getFuelEntryHeatmap(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelHeatmapCell[]> {
    const collection = await this.getCollection();
    const matchStage = this.buildBaseMatch(tenantId, dateRange);

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: { dayOfWeek: { $dayOfWeek: '$date' }, hour: { $hour: '$date' } },
          count: { $sum: 1 },
        },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    // Mongo $dayOfWeek: 1=Sunday..7=Saturday -> normalize to 0=Sunday..6=Saturday
    return results.map((r) => ({
      dayOfWeek: r._id.dayOfWeek - 1,
      hour: r._id.hour,
      count: r.count,
    }));
  }
}

export const fuelRepository = new FuelRepository();