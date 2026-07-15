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
} from '@/shared/types/fuel.types';
import {
  PaginationParams,
  PaginatedResponse,
} from '@/shared/types/common.types';
import { Filter, ObjectId } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';

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

/**
 * FIX (medium -- duplicated magic number): the "abnormal consumption"
 * multiplier used to be hardcoded separately as `avg * 2` inline in
 * getFuelKpis() and as the `threshold: number = 2` default parameter in
 * getAbnormalConsumption(). Two independent literals expressing the same
 * business rule will eventually drift if one gets tuned and the other
 * doesn't -- the KPI card and the abnormal-consumption list would then
 * silently disagree about what counts as anomalous. Single source of
 * truth now; getFuelKpis() uses this as its default and
 * getAbnormalConsumption() keeps accepting an explicit override (its
 * default also comes from here) so a caller-supplied threshold still
 * works for both.
 */
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

  /**
   * NEW: batch-resolves driver_id -> {_id, name, driver_code} for a page
   * of fuel logs in a single query (no N+1), and attaches it as `.driver`.
   * Logs with no driver_id, or a driver_id that no longer resolves (soft
   * deleted / dangling reference), are left with `driver` undefined --
   * this is a display-only enrichment, never a hard failure.
   */
  private async enrichWithDrivers(logs: FuelLog[]): Promise<FuelLog[]> {
    const driverIds = Array.from(
      new Set(logs.map((l) => l.driver_id).filter((id): id is string => Boolean(id)))
    );
    if (driverIds.length === 0) return logs;

    const objectIds = driverIds
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));
    if (objectIds.length === 0) return logs;

    const db = await connectToDatabase();
    const drivers = await db
      .collection('tbldrivers')
      .find({ _id: { $in: objectIds } }, { projection: { name: 1, driver_code: 1 } })
      .toArray();

    const driverMap = new Map(drivers.map((d) => [String(d._id), { _id: String(d._id), name: d.name as string, driver_code: d.driver_code as string | undefined }]));

    return logs.map((log) => {
      if (!log.driver_id) return log;
      const driver = driverMap.get(log.driver_id);
      return driver ? { ...log, driver } : log;
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
    return { ...result, data: await this.enrichWithDrivers(result.data) };
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
    // NEW: filter fuel logs by driver
    if (filters.driver_id) filter.driver_id = filters.driver_id;
    if (filters.startDate || filters.endDate) {
      filter.date = {};
      if (filters.startDate) (filter.date as any).$gte = filters.startDate;
      if (filters.endDate) (filter.date as any).$lte = filters.endDate;
    }

    const result = await this.findWithPagination(filter as Filter<FuelLog>, pagination, tenantId);
    return { ...result, data: await this.enrichWithDrivers(result.data) };
  }

  /** Override so single-record reads (detail page, edit modal) also carry `driver`. */
  async findById(id: string, tenantId: string): Promise<FuelLog | null> {
    const log = await super.findById(id, tenantId);
    if (!log) return null;
    const [enriched] = await this.enrichWithDrivers([log]);
    return enriched;
  }

  async getFuelStats(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelStats> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const filter: Record<string, unknown> = {
      isDeleted: { $ne: true },
    };
    if (!isSuperAdmin) {
      filter.tenantId = tenantId;
    }

    if (dateRange?.startDate) (filter.date as any) = { $gte: dateRange.startDate };
    if (dateRange?.endDate) filter.date = { ...(filter.date as any), $lte: dateRange.endDate };

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
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const matchStage: Record<string, unknown> = {
      isDeleted: { $ne: true },
      date: { $gte: startDate },
    };
    if (!isSuperAdmin) {
      matchStage.tenantId = tenantId;
    }

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
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const matchStage: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (!isSuperAdmin) {
      matchStage.tenantId = tenantId;
    }

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
   * NEW: "Fuel Consumption by Driver" -- single aggregation pipeline
   * (no N+1) that groups fuel logs by driver_id, sums volume/cost, and
   * counts distinct vehicles per driver. Logs without a driver_id (all
   * pre-existing records, plus any new record where driver is left
   * blank) are grouped into a single "Unassigned" bucket rather than
   * being dropped, so totals still reconcile against getFuelStats().
   *
   * Driver names are resolved in a second, single batched query against
   * tbldrivers (not per-row), keeping this index-friendly and O(1)
   * round trips regardless of fleet size.
   */
  async getFuelByDriver(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10
  ): Promise<DriverFuelConsumptionRow[]> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const matchStage: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (!isSuperAdmin) matchStage.tenantId = tenantId;
    if (dateRange?.startDate || dateRange?.endDate) {
      matchStage.date = {};
      if (dateRange.startDate) (matchStage.date as any).$gte = dateRange.startDate;
      if (dateRange.endDate) (matchStage.date as any).$lte = dateRange.endDate;
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: { $ifNull: ['$driver_id', null] },
          totalFuel: { $sum: '$fuel_volume' },
          totalCost: { $sum: '$cost' },
          count: { $sum: 1 },
          vehicles: { $addToSet: '$license_plate' },
        },
      },
      { $sort: { totalFuel: -1 } },
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

  /**
   * FIX (medium -- fallback-derived distance not surfaced): previously
   * computed `fallbackVehicleCount` (how many vehicles had zero/missing
   * odometer data for the period and fell back to trip-derived
   * distance) but discarded it before returning. The KPI response gave
   * no signal that part of "total distance" -- and therefore
   * "efficiency"/"cost per km" -- was estimated from trip logs rather
   * than measured odometer deltas. Now returned on FuelKpis so the UI
   * can show e.g. "3 vehicles estimated from trip logs" next to the
   * efficiency card instead of presenting a blended figure as if it
   * were uniformly odometer-derived.
   */
  async getFuelKpis(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    tripDistanceByVehicle?: Record<string, number>,
    prevTripDistanceByVehicle?: Record<string, number>
  ): Promise<FuelKpis> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);
    const now = new Date();

    const rangeEnd = dateRange?.endDate ?? now;
    const rangeStart = dateRange?.startDate ?? new Date(rangeEnd.getTime() - 90 * 24 * 60 * 60 * 1000);
    const periodMs = rangeEnd.getTime() - rangeStart.getTime();
    const prevRangeEnd = new Date(rangeStart.getTime() - 1);
    const prevRangeStart = new Date(prevRangeEnd.getTime() - periodMs);

    const baseMatch: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (!isSuperAdmin) {
      baseMatch.tenantId = tenantId;
    }

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
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const matchStage: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (!isSuperAdmin) {
      matchStage.tenantId = tenantId;
    }

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
}

export const fuelRepository = new FuelRepository();