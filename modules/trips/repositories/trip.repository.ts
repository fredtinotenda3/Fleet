// modules/trips/repositories/trip.repository.ts

import { BaseRepository } from '@/server/repositories/base.repository';
import {
  Trip,
  TripFilters,
  TripStats,
} from '@/shared/types/trip.types';
import {
  PaginationParams,
  PaginatedResponse,
} from '@/shared/types/common.types';
import { Filter } from 'mongodb';

export class TripRepository extends BaseRepository<Trip> {
  protected collectionName = 'tbltrips';

  /**
   * Mirrors VehicleRepository.isSuperAdminTenant(). BaseRepository's own
   * findMany/findWithPagination already treat these pseudo-tenant values
   * as "no tenant filter" internally, so the raw aggregation pipelines
   * below (which bypass BaseRepository) must apply the exact same rule --
   * otherwise stats endpoints undercount relative to the list endpoint
   * for super-admin sessions, since a strict `tenantId: 'default'` match
   * only picks up trips whose tenantId field is literally "default"
   * instead of every tenant's data.
   */
  private isSuperAdminTenant(tenantId: string): boolean {
    return (
      tenantId === 'default' ||
      tenantId === 'system' ||
      tenantId === 'super_admin'
    );
  }

  async findByLicensePlate(
    licensePlate: string,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Trip>> {
    return this.findWithPagination(
      { license_plate: licensePlate.toUpperCase() } as Filter<Trip>,
      pagination,
      tenantId
    );
  }

  async getFilteredTrips(
    filters: TripFilters,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Trip>> {
    const filter: Record<string, unknown> = {};

    if (filters.license_plate) {
      filter.license_plate = {
        $regex: filters.license_plate,
        $options: 'i',
      };
    }
    if (filters.mode) filter.mode = filters.mode;
    if (filters.driver_id) filter.driver_id = filters.driver_id;
    if (filters.startDate || filters.endDate) {
      filter.date = {};
      if (filters.startDate) (filter.date as any).$gte = filters.startDate;
      if (filters.endDate) (filter.date as any).$lte = filters.endDate;
    }

    return this.findWithPagination(
      filter as Filter<Trip>,
      pagination,
      tenantId
    );
  }

  async getTripStats(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<TripStats> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const filter: Record<string, unknown> = {
      isDeleted: { $ne: true },
    };
    if (!isSuperAdmin) {
      filter.tenantId = tenantId;
    }

    if (dateRange?.startDate || dateRange?.endDate) {
      filter.date = {};
      if (dateRange.startDate) (filter.date as any).$gte = dateRange.startDate;
      if (dateRange.endDate) (filter.date as any).$lte = dateRange.endDate;
    }

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
            {
              $group: {
                _id: '$license_plate',
                distance: { $sum: '$distance_calculated' },
              },
            },
            { $sort: { distance: -1 } },
          ],
          byDriver: [
            {
              $group: {
                _id: '$driver_id',
                distance: { $sum: '$distance_calculated' },
              },
            },
            { $sort: { distance: -1 } },
          ],
        },
      },
    ];

    const result = await collection.aggregate(pipeline).toArray();
    const data = result[0] || { totals: [], byVehicle: [], byDriver: [] };
    const totals = data.totals[0] || { totalDistance: 0, totalTrips: 0 };

    return {
      totalDistance: totals.totalDistance,
      totalTrips: totals.totalTrips,
      averageDistance:
        totals.totalTrips > 0
          ? totals.totalDistance / totals.totalTrips
          : 0,
      byVehicle: Object.fromEntries(
        (data.byVehicle || []).map((v: any) => [v._id, v.distance])
      ),
      byDriver: Object.fromEntries(
        (data.byDriver || []).map((d: any) => [
          d._id || 'unassigned',
          d.distance,
        ])
      ),
    };
  }

  async getDailyDistance(
    tenantId: string,
    days: number = 30
  ): Promise<Array<{ date: string; distance: number }>> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

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
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$date' },
          },
          distance: { $sum: '$distance_calculated' },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({ date: r._id, distance: r.distance }));
  }
}

export const tripRepository = new TripRepository();