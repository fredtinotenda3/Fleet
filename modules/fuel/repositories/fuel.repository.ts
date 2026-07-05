// modules/fuel/repositories/fuel.repository.ts

import { BaseRepository } from '@/server/repositories/base.repository';
import {
  FuelLog,
  FuelFilters,
  FuelStats,
} from '@/shared/types/fuel.types';
import {
  PaginationParams,
  PaginatedResponse,
} from '@/shared/types/common.types';
import { Filter } from 'mongodb';

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
}

export const fuelRepository = new FuelRepository();