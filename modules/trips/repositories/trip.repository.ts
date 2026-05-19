// modules/trips/repositories/trip.repository.ts

import { BaseRepository } from '@/server/repositories/base.repository';
import { Trip, TripFilters, TripStats } from '@/shared/types/trip.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { Filter } from 'mongodb';

export class TripRepository extends BaseRepository<Trip> {
  protected collectionName = 'tbltrips';

  async findByLicensePlate(licensePlate: string, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<Trip>> {
    return this.findWithPagination({ license_plate: licensePlate.toUpperCase() }, pagination, tenantId);
  }

  async getFilteredTrips(filters: TripFilters, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<Trip>> {
    const filter: Filter<Trip> = {};

    if (filters.license_plate) {
      filter.license_plate = { $regex: filters.license_plate, $options: 'i' };
    }
    if (filters.mode) {
      filter.mode = filters.mode;
    }
    if (filters.driver_id) {
      filter.driver_id = filters.driver_id;
    }
    if (filters.startDate || filters.endDate) {
      filter.date = {};
      if (filters.startDate) filter.date.$gte = filters.startDate;
      if (filters.endDate) filter.date.$lte = filters.endDate;
    }

    return this.findWithPagination(filter, pagination, tenantId);
  }

  async getTripStats(tenantId: string, dateRange?: { startDate?: Date; endDate?: Date }): Promise<TripStats> {
    const collection = await this.getCollection();
    const filter = this.getActiveFilter(tenantId);
    
    if (dateRange?.startDate) filter.date = { $gte: dateRange.startDate };
    if (dateRange?.endDate) filter.date = { ...filter.date, $lte: dateRange.endDate };

    const pipeline = [
      { $match: filter },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalDistance: { $sum: '$distance_calculated' },
                totalTrips: { $sum: 1 },
              },
            },
          ],
          byVehicle: [
            { $group: { _id: '$license_plate', distance: { $sum: '$distance_calculated' } } },
            { $sort: { distance: -1 } },
          ],
          byDriver: [
            { $group: { _id: '$driver_id', distance: { $sum: '$distance_calculated' } } },
            { $sort: { distance: -1 } },
          ],
        },
      },
    ];

    const result = await collection.aggregate(pipeline).toArray();
    const totals = result[0]?.totals[0] || { totalDistance: 0, totalTrips: 0 };

    return {
      totalDistance: totals.totalDistance,
      totalTrips: totals.totalTrips,
      averageDistance: totals.totalTrips > 0 ? totals.totalDistance / totals.totalTrips : 0,
      byVehicle: Object.fromEntries((result[0]?.byVehicle || []).map((v: any) => [v._id, v.distance])),
      byDriver: Object.fromEntries((result[0]?.byDriver || []).map((d: any) => [d._id, d.distance])),
    };
  }

  async getDailyDistance(tenantId: string, days: number = 30): Promise<Array<{ date: string; distance: number }>> {
    const collection = await this.getCollection();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const pipeline = [
      { $match: { ...this.getActiveFilter(tenantId), date: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          distance: { $sum: '$distance_calculated' },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map(r => ({ date: r._id, distance: r.distance }));
  }
}

export const tripRepository = new TripRepository();