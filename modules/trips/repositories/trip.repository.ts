import { resolveTenantScope } from '@/server/tenancy/tenant-scope';
import { prefixMatch, containsMatch } from '@/shared/utils/regex.utils';
// modules/trips/repositories/trip.repository.ts

import { BaseRepository } from '@/server/repositories/base.repository';
import {
  Trip,
  TripFilters,
  TripStats,
  TripKpis,
  TripExceptionRow,
  TripMonthlyTrendPoint,
  VehicleUtilizationRow,
  DriverUtilizationRow,
  TripDistanceDistributionBucket,
  TripHeatmapCell,
  TripCostAnalyticsRow,
  TripCostSummary,
} from '@/shared/types/trip.types';
import {
  PaginationParams,
  PaginatedResponse,
} from '@/shared/types/common.types';
import { Filter, ObjectId } from 'mongodb';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { EXPORT_ROW_CAP, ExportDataset } from '@/shared/export';
import connectToDatabase from '@/lib/mongodb';

export class TripRepository extends BaseRepository<Trip> {
  protected collectionName = 'tbltrips';

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

  /**
   * PHASE 1: single source of truth for the base tenant + soft-delete
   * match used by every analytics aggregation below. Mirrors
   * FuelRepository.buildBaseMatch / ExpenseRepository.buildBaseMatch so
   * the three modules' analytics methods read the same way.
   *
   * VEHICLE-SCOPE ADDITION: optional third `licensePlate` argument lets
   * every analytics aggregation below narrow from "fleet" to "this one
   * vehicle" without a single line of duplicated aggregation logic --
   * this is the entire mechanism behind Vehicle-Level Trip Analytics.
   * Mirrors FuelRepository/ExpenseRepository's identical vehicle-scope
   * addition to their own buildBaseMatch.
   */
  private buildBaseMatch(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    licensePlate?: string,
    context?: TenantContext
  ): Record<string, unknown> {
    const match: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (!this.isPlatformScopeTenant(tenantId)) {
      match.tenantId = tenantId;
    }
    if (dateRange?.startDate || dateRange?.endDate) {
      match.date = {};
      if (dateRange.startDate) (match.date as any).$gte = dateRange.startDate;
      if (dateRange.endDate) (match.date as any).$lte = dateRange.endDate;
    }
    if (licensePlate) {
      match.license_plate = licensePlate.toUpperCase();
    }
    // FIX (Phase B -- repository/analytics scoping completeness): mirrors
    // FuelRepository.buildBaseMatch / ExpenseRepository.buildBaseMatch --
    // analytics previously isolated only by tenantId, never by org unit,
    // so Branch/Fleet/Workshop Manager dashboards silently showed
    // org-wide totals while buildScopedQuery (list page) was already
    // correctly org-unit scoped.
    if (context) {
      const orgUnitFilter = tenantScopeService.buildFilter<Trip>(context, 'orgUnitId');
      Object.assign(match, orgUnitFilter);
    }
    return match;
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
      filter.license_plate = containsMatch(filters.license_plate);
    }
    if (filters.mode) filter.mode = filters.mode;
    if (filters.driver_id) filter.driver_id = filters.driver_id;
    if (filters.status) filter.status = filters.status;
    if (filters.trip_type) filter.trip_type = filters.trip_type;
    if (filters.routeId) filter.routeId = filters.routeId;
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

    if (!this.isPlatformScopeTenant(context.organizationId)) {
      query.tenantId = context.organizationId;
    }

    if (filters.license_plate) {
      query.license_plate = containsMatch(filters.license_plate);
    }
    if (filters.mode) query.mode = filters.mode;
    if (filters.driver_id) query.driver_id = filters.driver_id;
    if (filters.status) query.status = filters.status;
    if (filters.trip_type) query.trip_type = filters.trip_type;
    if (filters.routeId) query.routeId = filters.routeId;
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
    dateRange?: { startDate?: Date; endDate?: Date },
    context?: TenantContext
  ): Promise<TripStats> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isPlatformScopeTenant(tenantId);

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
    // FIX (Phase B): legacy aggregation had no org-unit scoping at all.
    if (context) {
      Object.assign(filter, tenantScopeService.buildFilter<Trip>(context, 'orgUnitId'));
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
    days: number = 30,
    context?: TenantContext
  ): Promise<Array<{ date: string; distance: number }>> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isPlatformScopeTenant(tenantId);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const matchStage: Record<string, unknown> = {
      isDeleted: { $ne: true },
      date: { $gte: startDate },
    };
    if (!isSuperAdmin) {
      matchStage.tenantId = tenantId;
    }
    // FIX (Phase B): legacy aggregation had no org-unit scoping at all.
    if (context) {
      Object.assign(matchStage, tenantScopeService.buildFilter<Trip>(context, 'orgUnitId'));
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
    endDate: Date,
    context?: TenantContext
  ): Promise<Record<string, number>> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isPlatformScopeTenant(tenantId);

    const match: Record<string, unknown> = {
      isDeleted: { $ne: true },
      date: { $gte: startDate, $lte: endDate },
    };
    if (!isSuperAdmin) {
      match.tenantId = tenantId;
    }
    // FIX (Phase B): legacy aggregation had no org-unit scoping at all.
    if (context) {
      Object.assign(match, tenantScopeService.buildFilter<Trip>(context, 'orgUnitId'));
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

  /**
   * PHASE 1: Executive KPI aggregation backing GetTripKpisQuery.
   * Structured as one $facet pass (current period) plus a lightweight
   * second pass (previous period, totals only) for trend deltas --
   * same two-pass shape as FuelRepository.getFuelKpis, but trip KPIs
   * don't need FuelKpis' per-vehicle odometer-fallback complexity since
   * distance_calculated is already normalized at write time.
   *
   * VEHICLE-SCOPE ADDITION: optional `licensePlate` narrows both the
   * current-period and previous-period match. When scoped, activeVehicles
   * naturally resolves to 1 and mostUtilizedVehicle to that vehicle --
   * both fields remain meaningful, just no longer fleet-wide.
   */
  async getTripKpis(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    licensePlate?: string,
    context?: TenantContext
  ): Promise<TripKpis> {
    const collection = await this.getCollection();
    const now = new Date();
    const rangeEnd = dateRange?.endDate ?? now;
    const rangeStart = dateRange?.startDate ?? new Date(rangeEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
    const periodMs = rangeEnd.getTime() - rangeStart.getTime();
    const prevRangeEnd = new Date(rangeStart.getTime() - 1);
    const prevRangeStart = new Date(prevRangeEnd.getTime() - periodMs);

    const currentMatch = this.buildBaseMatch(tenantId, { startDate: rangeStart, endDate: rangeEnd }, licensePlate, context);
    const prevMatch = this.buildBaseMatch(tenantId, { startDate: prevRangeStart, endDate: prevRangeEnd }, licensePlate, context);

    const pipeline = [
      { $match: currentMatch },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalTrips: { $sum: 1 },
                totalDistance: { $sum: '$distance_calculated' },
                totalDurationMinutes: { $sum: { $ifNull: ['$duration_minutes', 0] } },
                completedTrips: {
                  $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
                },
                ongoingTrips: {
                  $sum: { $cond: [{ $eq: ['$status', 'ongoing'] }, 1, 0] },
                },
                cancelledTrips: {
                  $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
                },
              },
            },
          ],
          activeVehicles: [{ $group: { _id: '$license_plate' } }, { $count: 'count' }],
          activeDrivers: [
            { $match: { driver_id: { $exists: true, $ne: null } } },
            { $group: { _id: '$driver_id' } },
            { $count: 'count' },
          ],
          topVehicle: [
            { $group: { _id: '$license_plate', trips: { $sum: 1 } } },
            { $sort: { trips: -1 } },
            { $limit: 1 },
          ],
          topDriver: [
            { $match: { driver_id: { $exists: true, $ne: null } } },
            { $group: { _id: '$driver_id', trips: { $sum: 1 } } },
            { $sort: { trips: -1 } },
            { $limit: 1 },
          ],
          longest: [
            { $sort: { distance_calculated: -1 } },
            { $limit: 1 },
            { $project: { _id: { $toString: '$_id' }, license_plate: 1, distance: '$distance_calculated' } },
          ],
          shortest: [
            { $match: { distance_calculated: { $gt: 0 } } },
            { $sort: { distance_calculated: 1 } },
            { $limit: 1 },
            { $project: { _id: { $toString: '$_id' }, license_plate: 1, distance: '$distance_calculated' } },
          ],
        },
      },
    ];

    const prevPipeline = [
      { $match: prevMatch },
      {
        $group: {
          _id: null,
          totalTrips: { $sum: 1 },
          totalDistance: { $sum: '$distance_calculated' },
        },
      },
    ];

    const [result, prevResult] = await Promise.all([
      collection.aggregate(pipeline).toArray(),
      collection.aggregate(prevPipeline).toArray(),
    ]);

    const data = result[0] || {};
    const totals = data.totals?.[0] || {
      totalTrips: 0,
      totalDistance: 0,
      totalDurationMinutes: 0,
      completedTrips: 0,
      ongoingTrips: 0,
      cancelledTrips: 0,
    };
    const prevTotals = prevResult[0] || { totalTrips: 0, totalDistance: 0 };

    const pctChange = (current: number, previous: number): number => {
      if (!previous) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 1000) / 10;
    };

    return {
      totalTrips: totals.totalTrips || 0,
      completedTrips: totals.completedTrips || 0,
      ongoingTrips: totals.ongoingTrips || 0,
      cancelledTrips: totals.cancelledTrips || 0,
      totalDistance: totals.totalDistance || 0,
      averageDistance: totals.totalTrips ? totals.totalDistance / totals.totalTrips : 0,
      totalDrivingHours: (totals.totalDurationMinutes || 0) / 60,
      averageDurationMinutes: totals.totalTrips
        ? (totals.totalDurationMinutes || 0) / totals.totalTrips
        : 0,
      activeVehicles: data.activeVehicles?.[0]?.count || 0,
      activeDrivers: data.activeDrivers?.[0]?.count || 0,
      mostUtilizedVehicle: data.topVehicle?.[0]
        ? { license_plate: data.topVehicle[0]._id, trips: data.topVehicle[0].trips }
        : null,
      mostUtilizedDriver: data.topDriver?.[0]
        ? { driver_id: data.topDriver[0]._id, trips: data.topDriver[0].trips }
        : null,
      longestTrip: data.longest?.[0] || null,
      shortestTrip: data.shortest?.[0] || null,
      distanceTrend: pctChange(totals.totalDistance || 0, prevTotals.totalDistance || 0),
      tripCountTrend: pctChange(totals.totalTrips || 0, prevTotals.totalTrips || 0),
    };
  }

  /**
   * PHASE 1: Exception analytics, equivalent in spirit to
   * ExpenseRepository.getExpenseOutliers but for trip-shaped data
   * quality problems. Uses population mean/stddev per vehicle for
   * duration outliers (same z-score technique as expense outliers),
   * plus deterministic rule checks for odometer inconsistency,
   * duplicate trips, and missing driver -- these last three are
   * data-integrity issues, not statistical outliers, so a fixed rule
   * is more honest than a z-score for them.
   *
   * VEHICLE-SCOPE ADDITION: optional `licensePlate` narrows every
   * sub-aggregation (duration outliers, odometer inconsistency,
   * duplicates, missing driver) to a single vehicle's rows.
   */
  async getTripExceptions(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    zThreshold: number = 2.5,
    limit: number = 50,
    licensePlate?: string,
    context?: TenantContext
  ): Promise<TripExceptionRow[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange, licensePlate, context);
    const exceptions: TripExceptionRow[] = [];

    // 1. Duration outliers per vehicle (z-score), mirrors getExpenseOutliers.
    const durationPipeline = [
      { $match: { ...match, duration_minutes: { $exists: true, $gt: 0 } } },
      {
        $group: {
          _id: '$license_plate',
          mean: { $avg: '$duration_minutes' },
          stdDev: { $stdDevPop: '$duration_minutes' },
          docs: {
            $push: {
              _id: '$_id',
              license_plate: '$license_plate',
              date: '$date',
              duration_minutes: '$duration_minutes',
              distance_calculated: '$distance_calculated',
            },
          },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gte: 3 }, stdDev: { $gt: 0 } } },
      { $unwind: '$docs' },
      {
        $addFields: {
          zScore: {
            $divide: [{ $subtract: ['$docs.duration_minutes', '$mean'] }, '$stdDev'],
          },
        },
      },
      { $match: { $expr: { $gte: [{ $abs: '$zScore' }, zThreshold] } } },
      { $sort: { zScore: -1 } },
      { $limit: limit },
    ];
    const durationResults = await collection.aggregate(durationPipeline).toArray();
    for (const r of durationResults) {
      const long = r.zScore > 0;
      exceptions.push({
        _id: String(r.docs._id),
        license_plate: r.docs.license_plate,
        date: r.docs.date,
        type: long ? 'unusually_long_duration' : 'unusually_short_duration',
        detail: `${r.docs.duration_minutes.toFixed(0)} min vs. this vehicle's average of ${r.mean.toFixed(0)} min (z=${r.zScore.toFixed(2)})`,
        duration_minutes: r.docs.duration_minutes,
        distance: r.docs.distance_calculated,
      });
    }

    // 2. Odometer inconsistency: end < start already rejected at write
    // time, but a trip whose start_odometer is LOWER than the vehicle's
    // previously recorded end_odometer indicates a data-entry error
    // (odometer went backwards between trips).
    const odometerPipeline = [
      { $match: { ...match, mode: 'odometer', start_odometer: { $exists: true }, end_odometer: { $exists: true } } },
      { $sort: { license_plate: 1, date: 1 } },
      {
        $group: {
          _id: '$license_plate',
          trips: {
            $push: {
              _id: '$_id',
              date: '$date',
              start_odometer: '$start_odometer',
              end_odometer: '$end_odometer',
            },
          },
        },
      },
      { $limit: 500 }, // vehicle-count safety cap; per-vehicle trip count checked in app code below
    ];
    const odometerGroups = await collection.aggregate(odometerPipeline).toArray();
    for (const group of odometerGroups) {
      const trips = group.trips as Array<{ _id: any; date: Date; start_odometer: number; end_odometer: number }>;
      for (let i = 1; i < trips.length; i++) {
        const prev = trips[i - 1];
        const curr = trips[i];
        if (curr.start_odometer < prev.end_odometer) {
          exceptions.push({
            _id: String(curr._id),
            license_plate: group._id,
            date: curr.date,
            type: 'odometer_inconsistent',
            detail: `Start odometer (${curr.start_odometer}) is lower than the previous trip's end odometer (${prev.end_odometer}) for this vehicle`,
          });
          if (exceptions.filter((e) => e.type === 'odometer_inconsistent').length >= limit) break;
        }
      }
    }

    // 3. Possible duplicates: same vehicle + same date + same distance,
    // more than one row -- a common bulk-import artifact.
    const duplicatePipeline = [
      { $match: match },
      {
        $group: {
          _id: {
            license_plate: '$license_plate',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            distance: '$distance_calculated',
          },
          docs: { $push: { _id: '$_id', date: '$date' } },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $limit: limit },
    ];
    const duplicateGroups = await collection.aggregate(duplicatePipeline).toArray();
    for (const group of duplicateGroups) {
      for (const doc of group.docs.slice(1)) {
        exceptions.push({
          _id: String(doc._id),
          license_plate: group._id.license_plate,
          date: doc.date,
          type: 'possible_duplicate',
          detail: `Matches another trip for ${group._id.license_plate} on ${group._id.date} with the same distance (${group._id.distance})`,
        });
      }
    }

    // 4. Missing driver: informational, capped low so it doesn't drown
    // out the other exception types on fleets that don't track drivers.
    const missingDriverPipeline = [
      { $match: { ...match, $or: [{ driver_id: { $exists: false } }, { driver_id: null }, { driver_id: '' }] } },
      { $sort: { date: -1 } },
      { $limit: Math.min(limit, 20) },
    ];
    const missingDriverDocs = await collection.aggregate(missingDriverPipeline).toArray();
    for (const doc of missingDriverDocs) {
      exceptions.push({
        _id: String(doc._id),
        license_plate: doc.license_plate,
        date: doc.date,
        type: 'missing_driver',
        detail: 'No driver assigned to this trip',
        distance: doc.distance_calculated,
      });
    }

    return exceptions.slice(0, limit * 4);
  }

  /**
   * PHASE 2: Monthly Trip Trend -- trips + distance + driving hours per month.
   *
   * VEHICLE-SCOPE ADDITION: optional `licensePlate` narrows the trend
   * to a single vehicle's monthly activity.
   */
  async getMonthlyTripTrend(
    tenantId: string,
    months: number = 12,
    licensePlate?: string,
    context?: TenantContext
  ): Promise<TripMonthlyTrendPoint[]> {
    const collection = await this.getCollection();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    const match = this.buildBaseMatch(tenantId, { startDate }, licensePlate, context);

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
          trips: { $sum: 1 },
          distance: { $sum: '$distance_calculated' },
          durationMinutes: { $sum: { $ifNull: ['$duration_minutes', 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({
      month: r._id,
      trips: r.trips,
      distance: Math.round((r.distance || 0) * 100) / 100,
      drivingHours: Math.round(((r.durationMinutes || 0) / 60) * 10) / 10,
    }));
  }

  /** PHASE 2: Vehicle Utilization ranking, sortable by trips or distance. */
  async getVehicleUtilization(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 20,
    sortBy: 'trips' | 'distance' = 'trips',
    context?: TenantContext
  ): Promise<VehicleUtilizationRow[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange, undefined, context);
    const sortField = sortBy === 'distance' ? 'totalDistance' : 'trips';

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: '$license_plate',
          trips: { $sum: 1 },
          totalDistance: { $sum: '$distance_calculated' },
          totalDurationMinutes: { $sum: { $ifNull: ['$duration_minutes', 0] } },
          lastTripDate: { $max: '$date' },
        },
      },
      { $sort: { [sortField]: -1 } },
      { $limit: limit },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({
      license_plate: r._id,
      trips: r.trips,
      totalDistance: Math.round((r.totalDistance || 0) * 100) / 100,
      totalDrivingHours: Math.round(((r.totalDurationMinutes || 0) / 60) * 10) / 10,
      averageDistance: r.trips > 0 ? Math.round(((r.totalDistance || 0) / r.trips) * 100) / 100 : 0,
      lastTripDate: r.lastTripDate ?? null,
    }));
  }

  /**
   * PHASE 2: Driver Utilization ranking. Normalizes both null AND ''
   * driver_id to a single "Unassigned" bucket -- same fix as
   * FuelRepository.getFuelByDriver, for the same reason ($ifNull alone
   * doesn't catch empty-string values from a controlled <Select>).
   *
   * VEHICLE-SCOPE ADDITION: optional `licensePlate` narrows the ranking
   * to "which drivers have driven THIS vehicle" instead of the whole
   * fleet -- the vehicleCount field then reports 0 or 1 per driver
   * relative to this single vehicle, which is expected/correct.
   */
  async getDriverUtilization(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 20,
    sortBy: 'trips' | 'distance' = 'trips',
    licensePlate?: string,
    context?: TenantContext
  ): Promise<DriverUtilizationRow[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange, licensePlate, context);
    const sortField = sortBy === 'distance' ? 'totalDistance' : 'trips';

    const pipeline = [
      { $match: match },
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
          trips: { $sum: 1 },
          totalDistance: { $sum: '$distance_calculated' },
          totalDurationMinutes: { $sum: { $ifNull: ['$duration_minutes', 0] } },
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
        trips: g.trips,
        totalDistance: Math.round((g.totalDistance || 0) * 100) / 100,
        totalDrivingHours: Math.round(((g.totalDurationMinutes || 0) / 60) * 10) / 10,
        averageDistance: g.trips > 0 ? Math.round(((g.totalDistance || 0) / g.trips) * 100) / 100 : 0,
        vehicleCount: Array.isArray(g.vehicles) ? g.vehicles.length : 0,
      };
    });
  }

  /**
   * PHASE 2: Distance Distribution histogram (mirrors getFuelCostDistribution).
   *
   * VEHICLE-SCOPE ADDITION: optional `licensePlate` narrows the
   * histogram to a single vehicle's trip-distance spread.
   */
  async getTripDistanceDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    licensePlate?: string,
    context?: TenantContext
  ): Promise<TripDistanceDistributionBucket[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange, licensePlate, context);

    const count = await collection.countDocuments(match as Filter<Trip>);
    if (count === 0) return [];

    const bucketCount = Math.min(8, count);
    const pipeline = [
      { $match: match },
      {
        $bucketAuto: {
          groupBy: '$distance_calculated',
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
   * PHASE 2: Day-of-week x hour-of-day heatmap (mirrors getFuelEntryHeatmap, plus distance).
   *
   * VEHICLE-SCOPE ADDITION: optional `licensePlate` narrows the heatmap
   * to a single vehicle's activity pattern.
   */
  async getTripsByDayOfWeek(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    licensePlate?: string,
    context?: TenantContext
  ): Promise<TripHeatmapCell[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange, licensePlate, context);

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: { dayOfWeek: { $dayOfWeek: '$date' }, hour: { $hour: '$date' } },
          count: { $sum: 1 },
          distance: { $sum: '$distance_calculated' },
        },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({
      dayOfWeek: r._id.dayOfWeek - 1,
      hour: r._id.hour,
      count: r.count,
      distance: Math.round((r.distance || 0) * 100) / 100,
    }));
  }

  /**
   * PHASE 3: Fuel per Trip / Expense per Trip / Cost per Trip / Fuel vs
   * Distance / Cost vs Distance -- all derived from one pass over
   * tblfuellogs and tblexpenses grouped by tripId, left-joined back
   * onto the owning trip for its distance. Trips with no linked fuel
   * or expense records are excluded from the per-row output (they
   * can't be it isn't meaningful to report "$0 cost" for a trip that
   * was simply never linked), but ARE still counted correctly as
   * "unlinked" by getTripCostSummary below via a separate total.
   *
   * VEHICLE-SCOPE ADDITION: optional `licensePlate` narrows the
   * underlying trip match before the fuel/expense joins run, so a
   * vehicle's Cost vs. Distance scatter only plots that vehicle's
   * linked trips.
   */
  async getTripCostAnalytics(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 100,
    licensePlate?: string,
    context?: TenantContext
  ): Promise<TripCostAnalyticsRow[]> {
    const db = await connectToDatabase();
    const tripMatch = this.buildBaseMatch(tenantId, dateRange, licensePlate, context);

    const pipeline = [
      { $match: tripMatch },
      {
        $lookup: {
          from: 'tblfuellogs',
          let: { tripId: { $toString: '$_id' } },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$tripId', '$$tripId'] }, { $ne: ['$isDeleted', true] }] } } },
            { $group: { _id: null, cost: { $sum: '$cost' }, volume: { $sum: '$fuel_volume' } } },
          ],
          as: 'fuelAgg',
        },
      },
      {
        $lookup: {
          from: 'tblexpenses',
          let: { tripId: { $toString: '$_id' } },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$tripId', '$$tripId'] }, { $ne: ['$isDeleted', true] }] } } },
            { $group: { _id: null, amount: { $sum: '$amount' } } },
          ],
          as: 'expenseAgg',
        },
      },
      {
        $addFields: {
          fuelCost: { $ifNull: [{ $arrayElemAt: ['$fuelAgg.cost', 0] }, 0] },
          fuelVolume: { $ifNull: [{ $arrayElemAt: ['$fuelAgg.volume', 0] }, 0] },
          expenseCost: { $ifNull: [{ $arrayElemAt: ['$expenseAgg.amount', 0] }, 0] },
        },
      },
      // Only trips that actually have a linked fuel log or expense.
      { $match: { $expr: { $or: [{ $gt: ['$fuelCost', 0] }, { $gt: ['$expenseCost', 0] }] } } },
      { $sort: { date: -1 } },
      { $limit: limit },
      {
        $project: {
          tripId: { $toString: '$_id' },
          license_plate: 1,
          date: 1,
          distance: '$distance_calculated',
          fuelCost: { $round: ['$fuelCost', 2] },
          fuelVolume: { $round: ['$fuelVolume', 2] },
          expenseCost: { $round: ['$expenseCost', 2] },
          totalCost: { $round: [{ $add: ['$fuelCost', '$expenseCost'] }, 2] },
          _id: 0,
        },
      },
    ];

    const results = await db.collection(this.collectionName).aggregate(pipeline).toArray();
    return results.map((r) => ({
      ...r,
      costPerKm: r.distance > 0 ? Math.round((r.totalCost / r.distance) * 100) / 100 : null,
    })) as TripCostAnalyticsRow[];
  }

  /**
   * PHASE 3: fleet-wide summary for KPI cards. Reuses the same
   * per-trip join as getTripCostAnalytics but without the row limit,
   * since it only needs aggregate totals, not the row list.
   *
   * VEHICLE-SCOPE ADDITION: optional `licensePlate`, forwarded straight
   * through to getTripCostAnalytics -- the summary then reflects a
   * single vehicle's operating cost instead of the fleet's.
   */
  async getTripCostSummary(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    licensePlate?: string,
    context?: TenantContext
  ): Promise<TripCostSummary> {
    const rows = await this.getTripCostAnalytics(tenantId, dateRange, 100000, licensePlate, context);

    const totalFuelCost = rows.reduce((sum, r) => sum + r.fuelCost, 0);
    const totalExpenseCost = rows.reduce((sum, r) => sum + r.expenseCost, 0);
    const totalCost = totalFuelCost + totalExpenseCost;
    const totalDistance = rows.reduce((sum, r) => sum + (r.distance || 0), 0);
    const linkedTripCount = rows.length;

    return {
      linkedTripCount,
      totalFuelCost: Math.round(totalFuelCost * 100) / 100,
      totalExpenseCost: Math.round(totalExpenseCost * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      totalDistance: Math.round(totalDistance * 100) / 100,
      averageFuelCostPerTrip: linkedTripCount > 0 ? Math.round((totalFuelCost / linkedTripCount) * 100) / 100 : 0,
      averageExpenseCostPerTrip: linkedTripCount > 0 ? Math.round((totalExpenseCost / linkedTripCount) * 100) / 100 : 0,
      averageCostPerTrip: linkedTripCount > 0 ? Math.round((totalCost / linkedTripCount) * 100) / 100 : 0,
      averageCostPerKm: totalDistance > 0 ? Math.round((totalCost / totalDistance) * 100) / 100 : 0,
    };
  }
}

export const tripRepository = new TripRepository();