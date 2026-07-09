// modules/fuel/repositories/fuel.repository.ts

import { BaseRepository } from '@/server/repositories/base.repository';
import {
  FuelLog,
  FuelFilters,
  FuelStats,
  FuelKpis,
  AbnormalFuelConsumptionRow,
} from '@/shared/types/fuel.types';
import {
  PaginationParams,
  PaginatedResponse,
} from '@/shared/types/common.types';
import { Filter } from 'mongodb';

interface VehiclePeriodAggregate {
  _id: string;
  minOdometer?: number;
  maxOdometer?: number;
  totalFuel: number;
  totalCost: number;
  count: number;
  avgVolume: number;
}

export class FuelRepository extends BaseRepository<FuelLog> {
  protected collectionName = 'tblfuellogs';

  async findByLicensePlate(
    licensePlate: string,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<FuelLog>> {
    return this.findWithPagination(
      { license_plate: licensePlate.toUpperCase() } as Filter<FuelLog>,
      pagination,
      tenantId
    );
  }

  async getFilteredLogs(
    filters: FuelFilters,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<FuelLog>> {
    const filter: Record<string, unknown> = {};

    if (filters.license_plate) {
      filter.license_plate = {
        $regex: filters.license_plate,
        $options: 'i',
      };
    }
    if (filters.unit_id) {
      filter.unit_id = filters.unit_id;
    }
    if (filters.startDate || filters.endDate) {
      filter.date = {};
      if (filters.startDate) (filter.date as any).$gte = filters.startDate;
      if (filters.endDate) (filter.date as any).$lte = filters.endDate;
    }

    return this.findWithPagination(
      filter as Filter<FuelLog>,
      pagination,
      tenantId
    );
  }

  async getFuelStats(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelStats> {
    const collection = await this.getCollection();
    const filter: Record<string, unknown> = {
      isDeleted: { $ne: true },
      tenantId,
    };

    if (dateRange?.startDate)
      (filter.date as any) = { $gte: dateRange.startDate };
    if (dateRange?.endDate)
      filter.date = { ...(filter.date as any), $lte: dateRange.endDate };

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
        },
      },
    ];

    const result = await collection.aggregate(pipeline).toArray();
    const data = result[0]?.total[0] || {
      totalFuel: 0,
      totalCost: 0,
      count: 0,
    };

    return {
      totalFuel: data.totalFuel,
      totalCost: data.totalCost,
      averageCostPerUnit:
        data.totalFuel > 0 ? data.totalCost / data.totalFuel : 0,
      logCount: data.count,
      efficiency: null,
    };
  }

  async getMonthlyFuelConsumption(
    tenantId: string,
    months: number = 12
  ): Promise<Array<{ month: string; fuel: number; cost: number }>> {
    const collection = await this.getCollection();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const pipeline = [
      {
        $match: {
          isDeleted: { $ne: true },
          tenantId,
          date: { $gte: startDate },
        },
      },
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
    return results.map((r) => ({
      month: r._id,
      fuel: r.fuel,
      cost: r.cost,
    }));
  }

  async getTopFuelConsumers(
    tenantId: string,
    limit: number = 5
  ): Promise<Array<{ license_plate: string; totalFuel: number; totalCost: number }>> {
    const collection = await this.getCollection();

    const pipeline = [
      { $match: { isDeleted: { $ne: true }, tenantId } },
      {
        $group: {
          _id: '$license_plate',
          totalFuel: { $sum: '$fuel_volume' },
          totalCost: { $sum: '$cost' },
        },
      },
      { $sort: { totalFuel: -1 } },
      { $limit: limit },
      {
        $project: {
          license_plate: '$_id',
          totalFuel: 1,
          totalCost: 1,
          _id: 0,
        },
      },
    ];

    return collection.aggregate(pipeline).toArray() as Promise<
      Array<{ license_plate: string; totalFuel: number; totalCost: number }>
      >;
  }

  /**
   * Fleet fuel-efficiency KPIs. Distance is derived from odometer deltas
   * per vehicle within the period (max - min odometer reading), so it
   * requires at least two odometer-tagged fills per vehicle to contribute.
   * Trend fields compare the requested period against an equal-length
   * immediately-preceding period.
   */
  async getFuelKpis(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<FuelKpis> {
    const collection = await this.getCollection();
    const now = new Date();

    const rangeEnd = dateRange?.endDate ?? now;
    const rangeStart =
      dateRange?.startDate ?? new Date(rangeEnd.getTime() - 90 * 24 * 60 * 60 * 1000);
    const periodMs = rangeEnd.getTime() - rangeStart.getTime();
    const prevRangeEnd = new Date(rangeStart.getTime() - 1);
    const prevRangeStart = new Date(prevRangeEnd.getTime() - periodMs);

    const baseMatch = { isDeleted: { $ne: true }, tenantId };

    const aggregateByVehicle = async (
      start: Date,
      end: Date
    ): Promise<VehiclePeriodAggregate[]> => {
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
      collection
        .find({ ...baseMatch, date: { $gte: rangeStart, $lte: rangeEnd } })
        .sort({ date: -1 })
        .toArray(),
    ]);

    const summarize = (byVehicle: VehiclePeriodAggregate[]) => {
      let totalDistance = 0;
      let totalFuel = 0;
      let totalCost = 0;
      for (const v of byVehicle) {
        totalFuel += v.totalFuel || 0;
        totalCost += v.totalCost || 0;
        if (
          typeof v.minOdometer === 'number' &&
          typeof v.maxOdometer === 'number' &&
          v.maxOdometer > v.minOdometer
        ) {
          totalDistance += v.maxOdometer - v.minOdometer;
        }
      }
      const efficiency = totalFuel > 0 ? totalDistance / totalFuel : 0;
      const costPerKm = totalDistance > 0 ? totalCost / totalDistance : 0;
      return { totalDistance, totalFuel, totalCost, efficiency, costPerKm };
    };

    const current = summarize(currentByVehicle);
    const previous = summarize(previousByVehicle);

    const vehicleAvgVolume = new Map<string, number>();
    currentByVehicle.forEach((v) => vehicleAvgVolume.set(v._id, v.avgVolume || 0));

    let abnormalCount = 0;
    for (const log of recentLogs) {
      const avg = vehicleAvgVolume.get(log.license_plate) || 0;
      if (avg > 0 && log.fuel_volume > avg * 2) abnormalCount += 1;
    }
    const abnormalConsumptionPercentage =
      recentLogs.length > 0 ? Math.round((abnormalCount / recentLogs.length) * 1000) / 10 : 0;

    const mostRecent = recentLogs[0];
    const daysSinceLastFill = mostRecent
      ? Math.max(
          0,
          Math.floor((now.getTime() - new Date(mostRecent.date).getTime()) / (24 * 60 * 60 * 1000))
        )
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
    };
  }

  /**
   * Flags fill-ups whose volume exceeds a vehicle's own rolling average
   * volume by `threshold`x -- a lightweight, explainable stand-in for the
   * fuel-fraud/anomaly AI service (modules/ai/services/fuel-fraud-detection.service.ts),
   * scoped to this repository so the widget has no cross-module coupling.
   */
  async getAbnormalConsumption(
    tenantId: string,
    threshold: number = 2
  ): Promise<AbnormalFuelConsumptionRow[]> {
    const collection = await this.getCollection();

    const pipeline = [
      { $match: { isDeleted: { $ne: true }, tenantId } },
      {
        $group: {
          _id: '$license_plate',
          avgVolume: { $avg: '$fuel_volume' },
          logs: { $push: '$$ROOT' },
        },
      },
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