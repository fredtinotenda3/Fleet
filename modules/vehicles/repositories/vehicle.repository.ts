import { resolveTenantScope } from '@/server/tenancy/tenant-scope';
import { prefixMatch, containsMatch } from '@/shared/utils/regex.utils';
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

  /**
   * FIX (tenant-isolation drift): this was a private per-repository copy
   * of the "which tenantId means skip filtering" rule. Six repositories
   * each maintained their own, and they drifted -- base.repository.ts's
   * own comments document a production bug where the dashboard and the
   * list page disagreed. All copies now delegate to the single
   * fail-closed resolver in server/tenancy/tenant-scope.ts, where the
   * legacy 'default'/'system'/'super_admin' values are REJECTED rather
   * than treated as platform-wide access.
   */
  private isPlatformScopeTenant(tenantId: string): boolean {
    return resolveTenantScope(tenantId).kind === 'platform';
  }

  async findByLicensePlate(
    licensePlate: string,
    tenantId: string
  ): Promise<Vehicle | null> {
    return this.findOne(
      { license_plate: licensePlate.toUpperCase() } as Filter<Vehicle>,
      tenantId,
      false,
      this.isPlatformScopeTenant(tenantId)
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
      this.isPlatformScopeTenant(tenantId)
    );
  }

  /**
   * LEAK FIX -- search was organization-wide.
   *
   * Search is the easiest scoping gap to miss and one of the worst to
   * leave: the list page is filtered, so the data "looks" isolated,
   * but typing a plate into the search box returned any vehicle in the
   * organization. It also doubles as an enumeration oracle -- a scoped
   * user could probe for plates they cannot otherwise see and confirm
   * their existence one character at a time.
   *
   * `context` is optional so platform tooling keeps working; every
   * user-facing caller passes it.
   */
  async searchVehicles(
    searchTerm: string,
    tenantId: string,
    pagination: PaginationParams,
    context?: TenantContext
  ): Promise<PaginatedResponse<Vehicle>> {
    const filter: Filter<Vehicle> = {
      $or: [
        { license_plate: containsMatch(searchTerm) },
        { make: containsMatch(searchTerm) },
        { model: containsMatch(searchTerm) },
        { vin: containsMatch(searchTerm) },
      ],
    } as Filter<Vehicle>;

    if (context) {
      // Scope predicate spread LAST so it owns the orgUnitId key and the
      // $or search clause cannot widen it. Same ordering rule as
      // BaseRepository.findMany and the report query engine.
      const scoped = {
        ...filter,
        ...tenantScopeService.buildFilter<Vehicle>(context, 'orgUnitId'),
      } as Filter<Vehicle>;
      return this.findWithPagination(scoped, pagination, context.organizationId);
    }

    return this.findWithPagination(
      filter,
      pagination,
      tenantId,
      false,
      this.isPlatformScopeTenant(tenantId)
    );
  }

  async getFilteredVehicles(
    filters: VehicleFilters,
    pagination: PaginationParams,
    tenantId: string
  ): Promise<PaginatedResponse<Vehicle>> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isPlatformScopeTenant(tenantId);

    const query: Record<string, unknown> = {
      isDeleted: { $ne: true },
    };

    if (!isSuperAdmin) {
      query.tenantId = tenantId;
    }

    if (filters.license_plate) {
      query.license_plate = prefixMatch(filters.license_plate);
    }
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.make) {
      query.make = prefixMatch(filters.make);
    }
    if (filters.model) {
      query.model = prefixMatch(filters.model);
    }
    if (filters.year) {
      query.year = filters.year;
    }
    if (filters.vehicle_type) {
      query.vehicle_type = prefixMatch(filters.vehicle_type);
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
    if (!this.isPlatformScopeTenant(context.organizationId)) {
      query.tenantId = context.organizationId;
    }

    if (filters.license_plate) {
      query.license_plate = prefixMatch(filters.license_plate);
    }
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.make) {
      query.make = prefixMatch(filters.make);
    }
    if (filters.model) {
      query.model = prefixMatch(filters.model);
    }
    if (filters.year) {
      query.year = filters.year;
    }
    if (filters.vehicle_type) {
      query.vehicle_type = prefixMatch(filters.vehicle_type);
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

  /**
   * Fleet counts (total / active / inactive / maintenance).
   *
   * LEAK FIX: this drove the dashboard "Fleet size 76", the Vehicles page
   * summary cards, the Live-fleet-map count and the Organization page
   * fleet size -- and it took only a tenantId, so EVERY scoped user saw
   * the whole organization's counts. A Bulawayo branch manager with zero
   * vehicles was shown "76". The list endpoint beneath it was correctly
   * scoped, which is what produced the contradictory screen: summary
   * cards reading 76 above a table reading "No vehicles found".
   *
   * `context` is optional so existing org-wide callers (platform admin
   * screens, background jobs) keep working unchanged; when supplied, the
   * org-unit predicate is merged into the base filter, so it applies to
   * all four counts rather than only the total.
   */
  async getVehicleStats(
    tenantId: string,
    context?: TenantContext
  ): Promise<VehicleStats> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isPlatformScopeTenant(tenantId);

    const baseFilter: Record<string, unknown> = {
      isDeleted: { $ne: true },
    };
    if (!isSuperAdmin) {
      baseFilter.tenantId = tenantId;
    }
    if (context) {
      Object.assign(baseFilter, tenantScopeService.buildFilter<Vehicle>(context, 'orgUnitId'));
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
      this.isPlatformScopeTenant(tenantId)
    );
  }

  async getVehiclesDueForService(
    mileageThreshold: number,
    tenantId: string
  ): Promise<Vehicle[]> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isPlatformScopeTenant(tenantId);

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

  /**
   * PHASE 0 FIX: this aggregation had no org-unit scoping option at all
   * (unlike every sibling *Stats method on this repository, which
   * accepts an optional `context` and applies
   * `tenantScopeService.buildFilter(context, 'orgUnitId')` -- see
   * getVehicleStats above) -- and fleetAnalyticsService.getCostBreakdown()
   * called it WITHOUT a context even though it threads context through
   * every other repository call in the same method. Net effect: the
   * "cost by vehicle" panel of the cost-breakdown dashboard returned
   * every vehicle in the tenant, regardless of the caller's org-unit
   * scope, while the KPI/operational-metrics panels right next to it on
   * the same dashboard were correctly scoped. Exactly the
   * "list endpoint scoped, aggregate endpoint not" pattern this
   * codebase has hit before (see the Phase 0 report's analytics
   * scope-governance section).
   */
  async getVehicleAnalytics(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    context?: TenantContext
  ): Promise<Document[]> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isPlatformScopeTenant(tenantId);

    const baseFilter: Record<string, unknown> = {
      isDeleted: { $ne: true },
    };
    if (!isSuperAdmin) {
      baseFilter.tenantId = tenantId;
    }
    if (context) {
      Object.assign(baseFilter, tenantScopeService.buildFilter<Vehicle>(context, 'orgUnitId'));
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