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
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { EXPORT_ROW_CAP, ExportDataset } from '@/shared/export';

export class TripRepository extends BaseRepository<Trip> {
  protected collectionName = 'tbltrips';

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

  /**
   * Org/branch-scoped variant of getFilteredTrips. Mirrors
   * VehicleRepository.getFilteredVehiclesInScope: applies the same
   * filters, then narrows to the org units the caller may see via
   * tenantScopeService.buildFilter(context, 'orgUnitId'), on top of
   * (not instead of) tenant isolation.
   */
  /**
   * Single source of truth for the tenant + org-unit-scope + filter
   * query shared by getFilteredTripsInScope (paginated list) and
   * getFilteredTripsForExport (uncapped-by-pagination export).
   */
  private buildScopedQuery(filters: TripFilters, context: TenantContext): Record<string, unknown> {
    const query: Record<string, unknown> = {
      isDeleted: { $ne: true },
    };

    if (!this.isSuperAdminTenant(context.organizationId)) {
      query.tenantId = context.organizationId;
    }

    if (filters.license_plate) {
      query.license_plate = {
        $regex: filters.license_plate,
        $options: 'i',
      };
    }
    if (filters.mode) query.mode = filters.mode;
    if (filters.driver_id) query.driver_id = filters.driver_id;
    if (filters.startDate || filters.endDate) {
      query.date = {};
      if (filters.startDate) (query.date as any).$gte = filters.startDate;
      if (filters.endDate) (query.date as any).$lte = filters.endDate;
    }

    const scopeFilter = tenantScopeService.buildFilter<Trip>(context, 'orgUnitId');
    Object.assign(query, scopeFilter);

    return query;
  }

  async getFilteredTripsInScope(
    filters: TripFilters,
    context: TenantContext,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Trip>> {
    const collection = await this.getCollection();
    const query = this.buildScopedQuery(filters, context);

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      collection
        .find(query as Filter<Trip>)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments(query as Filter<Trip>),
    ]);

    return {
      data: data as Trip[],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Export variant of getFilteredTripsInScope: same filters and same
   * tenant/org-unit scope, but returns up to `cap` matching records
   * (default EXPORT_ROW_CAP) ignoring UI pagination, plus the true
   * total match count so the caller can detect truncation.
   */
  async getFilteredTripsForExport(
    filters: TripFilters,
    context: TenantContext,
    cap: number = EXPORT_ROW_CAP
  ): Promise<ExportDataset<Trip>> {
    const collection = await this.getCollection();
    const query = this.buildScopedQuery(filters, context);

    const [rows, totalMatched] = await Promise.all([
      collection
        .find(query as Filter<Trip>)
        .sort({ createdAt: -1 })
        .limit(cap)
        .toArray(),
      collection.countDocuments(query as Filter<Trip>),
    ]);

    return {
      rows: rows as Trip[],
      totalMatched,
      truncated: totalMatched > rows.length,
      exportCap: cap,
    };
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

  /**
   * Per-vehicle distance total within a date window, keyed by
   * license_plate. Added specifically so FuelQueryService can fall back
   * to trip-derived distance when a vehicle's fuel logs have sparse/zero
   * odometer readings -- odometer-derived distance and trip-derived
   * distance are two independent measurements of the same physical
   * quantity, and trips are the more reliable of the two in this dataset
   * since CreateTripHandler already rejects any trip with
   * distance_calculated <= 0 at write time, while fuel-log odometer has
   * no equivalent guard.
   */
  async getDistanceByVehicle(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Record<string, number>> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const match: Record<string, unknown> = {
      isDeleted: { $ne: true },
      date: { $gte: startDate, $lte: endDate },
    };
    if (!isSuperAdmin) {
      match.tenantId = tenantId;
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: '$license_plate',
          distance: { $sum: '$distance_calculated' },
        },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return Object.fromEntries(results.map((r) => [r._id as string, r.distance as number]));
  }
}

export const tripRepository = new TripRepository();