// modules/vehicles/repositories/vehicle.repository.ts

import { Filter, Document, ObjectId } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import {
  Vehicle,
  VehicleFilters,
  VehicleStats,
} from '@/shared/types/vehicle.types';
import {
  PaginationParams,
  PaginatedResponse,
} from '@/shared/types/common.types';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { EXPORT_ROW_CAP, ExportDataset } from '@/shared/export';

export class VehicleRepository extends BaseRepository<Vehicle> {
  protected collectionName = 'tblvehicles';

  private isSuperAdminTenant(tenantId: string): boolean {
    return (
      tenantId === 'default' ||
      tenantId === 'system' ||
      tenantId === 'super_admin'
    );
  }

  async findByLicensePlate(
    licensePlate: string,
    tenantId: string
  ): Promise<Vehicle | null> {
    return this.findOne(
      { license_plate: licensePlate.toUpperCase() } as Filter<Vehicle>,
      tenantId,
      false,
      this.isSuperAdminTenant(tenantId)
    );
  }

  async findByLicensePlates(
    licensePlates: string[],
    tenantId: string
  ): Promise<Vehicle[]> {
    return this.findMany(
      {
        license_plate: { $in: licensePlates.map((p) => p.toUpperCase()) },
      } as Filter<Vehicle>,
      tenantId,
      {},
      false,
      this.isSuperAdminTenant(tenantId)
    );
  }

  async searchVehicles(
    searchTerm: string,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Vehicle>> {
    const filter: Filter<Vehicle> = {
      $or: [
        { license_plate: { $regex: searchTerm, $options: 'i' } },
        { make: { $regex: searchTerm, $options: 'i' } },
        { model: { $regex: searchTerm, $options: 'i' } },
        { vin: { $regex: searchTerm, $options: 'i' } },
      ],
    } as Filter<Vehicle>;
    return this.findWithPagination(
      filter,
      pagination,
      tenantId,
      false,
      this.isSuperAdminTenant(tenantId)
    );
  }

  async getFilteredVehicles(
    filters: VehicleFilters,
    pagination: PaginationParams,
    tenantId: string
  ): Promise<PaginatedResponse<Vehicle>> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const query: Record<string, unknown> = {
      isDeleted: { $ne: true },
    };

    if (!isSuperAdmin) {
      query.tenantId = tenantId;
    }

    if (filters.license_plate) {
      query.license_plate = {
        $regex: `^${filters.license_plate}`,
        $options: 'i',
      };
    }
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.make) {
      query.make = { $regex: `^${filters.make}`, $options: 'i' };
    }
    if (filters.model) {
      query.model = { $regex: `^${filters.model}`, $options: 'i' };
    }
    if (filters.year) {
      query.year = filters.year;
    }
    if (filters.vehicle_type) {
      query.vehicle_type = {
        $regex: `^${filters.vehicle_type}`,
        $options: 'i',
      };
    }

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      collection
        .find(query as Filter<Vehicle>)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments(query as Filter<Vehicle>),
    ]);

    return {
      data: data as Vehicle[],
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
   * Single source of truth for the tenant + org-unit-scope + filter
   * query shared by getFilteredVehiclesInScope (paginated list) and
   * getFilteredVehiclesForExport (uncapped-by-pagination export).
   * Extracted during the Phase 2 Enterprise Export Framework work so
   * the two call sites can never drift on what "matches the filters,
   * in scope" means.
   */
  private buildScopedQuery(filters: VehicleFilters, context: TenantContext): Record<string, unknown> {
    const query: Record<string, unknown> = {
      isDeleted: { $ne: true },
    };

    // Tenant isolation — super admins skip this, same as getFilteredVehicles
    if (!this.isSuperAdminTenant(context.organizationId)) {
      query.tenantId = context.organizationId;
    }

    if (filters.license_plate) {
      query.license_plate = {
        $regex: `^${filters.license_plate}`,
        $options: 'i',
      };
    }
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.make) {
      query.make = { $regex: `^${filters.make}`, $options: 'i' };
    }
    if (filters.model) {
      query.model = { $regex: `^${filters.model}`, $options: 'i' };
    }
    if (filters.year) {
      query.year = filters.year;
    }
    if (filters.vehicle_type) {
      query.vehicle_type = {
        $regex: `^${filters.vehicle_type}`,
        $options: 'i',
      };
    }

    // Apply org-unit scope filter on top of everything else
    const scopeFilter = tenantScopeService.buildFilter<Vehicle>(context, 'orgUnitId');
    Object.assign(query, scopeFilter);

    return query;
  }

  async getFilteredVehiclesInScope(
    filters: VehicleFilters,
    pagination: PaginationParams,
    context: TenantContext
  ): Promise<PaginatedResponse<Vehicle>> {
    const collection = await this.getCollection();
    const query = this.buildScopedQuery(filters, context);

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      collection
        .find(query as Filter<Vehicle>)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments(query as Filter<Vehicle>),
    ]);

    return {
      data: data as Vehicle[],
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
   * Export variant of getFilteredVehiclesInScope: same filters, same
   * tenant + org-unit scope, but ignores UI pagination entirely and
   * instead returns up to `cap` matching records (default
   * EXPORT_ROW_CAP) plus the true total match count, so the caller can
   * tell whether the export is complete or was truncated. This is the
   * Phase 2 fix for the "export only exports the currently loaded
   * page" bug -- previously Vehicles had no export query at all,
   * exports were built client-side from whatever page of
   * getFilteredVehiclesInScope() happened to already be loaded in the
   * UI table.
   */
  async getFilteredVehiclesForExport(
    filters: VehicleFilters,
    context: TenantContext,
    cap: number = EXPORT_ROW_CAP
  ): Promise<ExportDataset<Vehicle>> {
    const collection = await this.getCollection();
    const query = this.buildScopedQuery(filters, context);

    const [rows, totalMatched] = await Promise.all([
      collection
        .find(query as Filter<Vehicle>)
        .sort({ createdAt: -1 })
        .limit(cap)
        .toArray(),
      collection.countDocuments(query as Filter<Vehicle>),
    ]);

    return {
      rows: rows as Vehicle[],
      totalMatched,
      truncated: totalMatched > rows.length,
      exportCap: cap,
    };
  }

  async getVehicleStats(tenantId: string): Promise<VehicleStats> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const baseFilter: Record<string, unknown> = {
      isDeleted: { $ne: true },
    };
    if (!isSuperAdmin) {
      baseFilter.tenantId = tenantId;
    }

    const [total, active, inactive, maintenance] = await Promise.all([
      collection.countDocuments(baseFilter as Filter<Vehicle>),
      collection.countDocuments({
        ...baseFilter,
        status: 'active',
      } as Filter<Vehicle>),
      collection.countDocuments({
        ...baseFilter,
        status: 'inactive',
      } as Filter<Vehicle>),
      collection.countDocuments({
        ...baseFilter,
        status: 'maintenance',
      } as Filter<Vehicle>),
    ]);

    return { total, active, inactive, maintenance };
  }

  async getVehiclesByStatus(
    status: string,
    tenantId: string
  ): Promise<Vehicle[]> {
    return this.findMany(
      { status } as Filter<Vehicle>,
      tenantId,
      {},
      false,
      this.isSuperAdminTenant(tenantId)
    );
  }

  async getVehiclesDueForService(
    mileageThreshold: number,
    tenantId: string
  ): Promise<Vehicle[]> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const baseFilter: Record<string, unknown> = {
      isDeleted: { $ne: true },
    };
    if (!isSuperAdmin) {
      baseFilter.tenantId = tenantId;
    }

    const pipeline = [
      { $match: baseFilter },
      {
        $lookup: {
          from: 'tblmeterlogs',
          let: { plate: '$license_plate' },
          pipeline: [
            {
              $match: { $expr: { $eq: ['$license_plate', '$$plate'] } },
            },
            { $sort: { date: -1 } },
            { $limit: 1 },
            { $project: { odometer: 1 } },
          ],
          as: 'latest_meter',
        },
      },
      {
        $addFields: {
          currentOdometer: {
            $ifNull: [{ $arrayElemAt: ['$latest_meter.odometer', 0] }, 0],
          },
        },
      },
      {
        $match: {
          $expr: {
            $gte: [
              {
                $subtract: [
                  '$currentOdometer',
                  { $ifNull: ['$last_service_odometer', 0] },
                ],
              },
              mileageThreshold,
            ],
          },
        },
      },
    ];

    return collection.aggregate<Vehicle>(pipeline).toArray();
  }

  async getVehicleAnalytics(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Document[]> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const baseFilter: Record<string, unknown> = {
      isDeleted: { $ne: true },
    };
    if (!isSuperAdmin) {
      baseFilter.tenantId = tenantId;
    }

    const pipeline = [
      { $match: baseFilter },
      {
        $lookup: {
          from: 'tblexpenses',
          let: { plate: '$license_plate' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$license_plate', '$$plate'] },
                date: { $gte: startDate, $lte: endDate },
              },
            },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ],
          as: 'expense_total',
        },
      },
      {
        $lookup: {
          from: 'tblfuellogs',
          let: { plate: '$license_plate' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$license_plate', '$$plate'] },
                date: { $gte: startDate, $lte: endDate },
              },
            },
            {
              $group: {
                _id: null,
                totalFuel: { $sum: '$fuel_volume' },
                totalCost: { $sum: '$cost' },
              },
            },
          ],
          as: 'fuel_stats',
        },
      },
      {
        $addFields: {
          totalExpenses: {
            $ifNull: [
              { $arrayElemAt: ['$expense_total.total', 0] },
              0,
            ],
          },
          totalFuelCost: {
            $ifNull: [
              { $arrayElemAt: ['$fuel_stats.totalCost', 0] },
              0,
            ],
          },
          totalFuelVolume: {
            $ifNull: [
              { $arrayElemAt: ['$fuel_stats.totalFuel', 0] },
              0,
            ],
          },
        },
      },
      {
        $project: {
          _id: 1,
          license_plate: 1,
          make: 1,
          model: 1,
          year: 1,
          status: 1,
          totalExpenses: 1,
          totalFuelCost: 1,
          totalFuelVolume: 1,
          totalOperatingCost: {
            $add: ['$totalExpenses', '$totalFuelCost'],
          },
        },
      },
      { $sort: { totalOperatingCost: -1 } },
    ];

    return collection.aggregate(pipeline).toArray();
  }
}

export const vehicleRepository = new VehicleRepository();