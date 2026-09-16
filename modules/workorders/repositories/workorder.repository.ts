import { prefixMatch, containsMatch } from '@/shared/utils/regex.utils';
// modules/workorders/repositories/workorder.repository.ts
import { Filter } from 'mongodb';
import { BaseRepository, isPlatformSentinelTenant } from '@/server/repositories/base.repository';
import { WorkOrder, WorkOrderFilters, WorkOrderStatus } from '../types/workorder.types';
import '../types/workorder.tenancy-addendum';
import '../types/workorder.dvir-addendum';
import { PaginationParams, PaginatedResponse, DateRange, Priority } from '@/shared/types/common.types';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';

// R.3.6 -- Work Order Reporting. Hardcoded rather than derived from
// VALID_TRANSITIONS (workorder.service.ts, not exported) so this stays
// a plain data list with no service-layer coupling -- same pattern the
// frontend mirror (WORK_ORDER_STATUSES, frontend/modules/workorders/
// types/index.ts) already uses. Keep both in sync with WorkOrderStatus.
const ALL_STATUSES: WorkOrderStatus[] = ['open', 'assigned', 'in_progress', 'on_hold', 'completed', 'cancelled'];
const ALL_PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical'];

/**
 * R.3.6 -- Work Order Reporting KPI shape. Every field here is a real
 * aggregation over `tblworkorders`, computed inside Mongo in ONE
 * `$facet` pass (see getStatsInScope) -- there is no separate
 * "reporting" store and nothing here is estimated or backfilled.
 *
 * DATA TRUTH, read before changing any of this:
 *   - statusCounts/priorityCounts/sourceCounts are zero-filled for
 *     every known category. A category with zero matching documents
 *     genuinely has a count of 0 -- this is NOT the "missing -> 0"
 *     fabrication the platform's data-truth rules forbid, because the
 *     aggregation actually ran over every in-scope document; there is
 *     no failure being hidden behind the zero.
 *   - totalCost sums the `totalCost` field, which is REQUIRED on every
 *     WorkOrder and accumulates via consumeParts/recordLabor. A work
 *     order that has not yet incurred cost genuinely has totalCost: 0
 *     -- this is not "cost data unavailable."
 *   - turnaround.averageHours is computed ONLY over completed work
 *     orders that actually have a `completedAt` timestamp
 *     (`openedAt` is required, so no completed-and-missing-openedAt
 *     case exists). It is `null` -- not 0 -- when sampleSize is 0, so
 *     a caller can never render "0 hours" as if that were a measured
 *     value. `completedMissingTimestamps` discloses how many
 *     completed work orders exist that could NOT be averaged in, so a
 *     caller can show the coverage ("based on 4 of 6 completed work
 *     orders") rather than silently presenting a partial average as
 *     complete.
 *   - There is deliberately no `overdueCount` / SLA field anywhere in
 *     this shape. WorkOrder (workorder.types.ts) has no due-date or
 *     SLA-deadline field of any kind -- only openedAt/startedAt/
 *     completedAt. "Overdue" cannot be truthfully derived without
 *     inventing an arbitrary age threshold, which is exactly the
 *     fabricated-SLA-performance the platform's data-truth rules
 *     forbid. The caller (WorkOrderReports.tsx) renders this
 *     dimension as UNAVAILABLE with an explicit explanation instead of
 *     showing a number. See the R.3.6 handoff, "Genuinely Missing".
 *   - byWorkshop groups by the real `orgUnitId` stored on each work
 *     order (set from the vehicle at creation time, see
 *     WorkOrderService.create) and resolves a display name via a
 *     `$lookup` into `tblorgunits`, mirroring bootstrap-data-sources.ts
 *     #orgUnitLookupStages / alerts.data-source.ts's vehicle lookup.  A
 *     work order with no orgUnitId (written before that field existed
 *     -- see workorder.tenancy-addendum.ts) reports `orgUnitId: null`,
 *     never a fabricated branch.
 */
export interface WorkOrderStats {
  totalCount: number;
  statusCounts: Record<WorkOrderStatus, number>;
  priorityCounts: Record<Priority, number>;
  /** Keyed by WorkOrder.source ('dvir' | 'manual' | 'reminder'). The closest genuine proxy this domain model has for "work-order type" -- see workorders.data-source.ts's header comment for why this is not a true category taxonomy. */
  sourceCounts: Record<string, number>;
  assignedCount: number;
  unassignedCount: number;
  totalCost: number;
  turnaround: {
    averageHours: number | null;
    sampleSize: number;
    completedMissingTimestamps: number;
  };
  byWorkshop: Array<{ orgUnitId: string | null; orgUnitName: string | null; count: number }>;
}

export class WorkOrderRepository extends BaseRepository<WorkOrder> {
  protected collectionName = 'tblworkorders';

  async getFiltered(filters: WorkOrderFilters, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<WorkOrder>> {
    const filter: Record<string, unknown> = {};
    if (filters.license_plate) {
      // See WorkOrderFilters.exactLicensePlate's doc comment.
      filter.license_plate = filters.exactLicensePlate
        ? filters.license_plate.toUpperCase()
        : containsMatch(filters.license_plate);
    }
    if (filters.status) filter.status = filters.status;
    if (filters.priority) filter.priority = filters.priority;
    if (filters.assignedMechanicId) filter.assignedMechanicId = filters.assignedMechanicId;
    return this.findWithPagination(filter as Filter<WorkOrder>, pagination, tenantId);
  }

  /**
   * Single source of truth for the tenant + org-unit-scope + filter
   * query shared by getFilteredInScope and getFilteredForExport, so the
   * two can never drift on what "matches the filters, in scope" means
   * -- mirrors FuelRepository.buildScopedQuery /
   * VehicleRepository.buildScopedQuery.
   */
  private buildScopedQuery(filters: WorkOrderFilters, context: TenantContext): Record<string, unknown> {
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };

    if (!isPlatformSentinelTenant(context.organizationId)) {
      query.tenantId = context.organizationId;
    }

    if (filters.license_plate) {
      // See WorkOrderFilters.exactLicensePlate's doc comment.
      query.license_plate = filters.exactLicensePlate
        ? filters.license_plate.toUpperCase()
        : containsMatch(filters.license_plate);
    }
    if (filters.status) query.status = filters.status;
    if (filters.priority) query.priority = filters.priority;
    if (filters.assignedMechanicId) query.assignedMechanicId = filters.assignedMechanicId;

    const scopeFilter = tenantScopeService.buildFilter<WorkOrder>(context, 'orgUnitId');
    Object.assign(query, scopeFilter);

    return query;
  }

  /**
   * Org-unit-scoped variant of getFiltered. A Workshop Manager only sees
   * work orders whose orgUnitId is one of context.accessibleOrgUnitIds
   * (their assigned workshop and its descendants); org-wide roles
   * (SUPER_ADMIN/ORGANIZATION_OWNER/ORGANIZATION_ADMIN -- see
   * FULL_ORG_UNIT_VISIBILITY_ROLES) get accessibleOrgUnitIds === null,
   * which buildFilter() treats as "no narrowing".
   */
  async getFilteredInScope(
    filters: WorkOrderFilters,
    context: TenantContext,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<WorkOrder>> {
    const collection = await this.getCollection();
    const query = this.buildScopedQuery(filters, context);

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      collection.find(query as Filter<WorkOrder>).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      collection.countDocuments(query as Filter<WorkOrder>),
    ]);

    return {
      data: data as WorkOrder[],
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

  /** Export variant: same filters/scope, uncapped by UI pagination, capped at `cap` rows instead. */
  async getFilteredForExport(
    filters: WorkOrderFilters,
    context: TenantContext,
    cap: number = 50000
  ): Promise<{ rows: WorkOrder[]; totalMatched: number; truncated: boolean }> {
    const collection = await this.getCollection();
    const query = this.buildScopedQuery(filters, context);

    const [rows, totalMatched] = await Promise.all([
      collection.find(query as Filter<WorkOrder>).sort({ createdAt: -1 }).limit(cap).toArray(),
      collection.countDocuments(query as Filter<WorkOrder>),
    ]);

    return { rows: rows as WorkOrder[], totalMatched, truncated: totalMatched > cap };
  }

  /**
   * Org-unit-scoped count of open work orders, grouped by status.
   *
   * AUDIT NOTE (R.3.6): the doc comment above this method has, since it
   * was written, claimed this "backs the Workshop Manager dashboard's
   * workload widget." A repository-first audit for R.3.6 (grep across
   * the whole tree for `countByStatusInScope`) found exactly one
   * caller: this file's own regression test's comment, mentioning it in
   * passing. No dashboard widget, page, or API route calls this method
   * -- the described widget does not exist. Left unchanged (it is a
   * correct, cheap, already-scoped query that some future caller may
   * still want, and deleting working code that isn't actually causing
   * harm is its own risk), but R.3.6's new `getStatsInScope` below is
   * what actually powers Work Order Reporting's status distribution --
   * it does not call this method, to avoid running two separate
   * aggregations over the same scoped query when one $facet pass
   * already computes status distribution alongside everything else the
   * report needs.
   */
  async countByStatusInScope(context: TenantContext): Promise<Record<string, number>> {
    const collection = await this.getCollection();
    const query = this.buildScopedQuery({}, context);

    const results = await collection
      .aggregate([
        { $match: query },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .toArray();

    const counts: Record<string, number> = {};
    for (const r of results) counts[r._id as string] = r.count;
    return counts;
  }

  /**
   * R.3.6 -- Work Order Reporting. The single aggregation backing the
   * Work Order Reports page and its KPI cards. Reuses buildScopedQuery
   * (same tenant + org-unit-scope + filter logic as
   * getFilteredInScope/getFilteredForExport/countByStatusInScope) so
   * this can never drift from what those methods consider "in scope."
   *
   * `dateRange`, when supplied, filters on `openedAt` (the work order's
   * created date) -- the same field every other part of this module
   * treats as the record's creation timestamp. This mirrors
   * fleet-analytics.service.ts's DateRange contract (inclusive
   * $gte/$lte bounds) already consumed by expense/fuel/trip stats.
   *
   * One $facet pass computes every KPI so the collection is scanned
   * once, not six times.
   */
  async getStatsInScope(context: TenantContext, dateRange?: DateRange): Promise<WorkOrderStats> {
    const collection = await this.getCollection();
    const query: Record<string, unknown> = this.buildScopedQuery({}, context);
    if (dateRange) {
      query.openedAt = { $gte: dateRange.startDate, $lte: dateRange.endDate };
    }

    const [facetResult] = await collection
      .aggregate([
        { $match: query },
        {
          $facet: {
            totalCount: [{ $count: 'count' }],
            statusCounts: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
            priorityCounts: [{ $group: { _id: '$priority', count: { $sum: 1 } } }],
            sourceCounts: [{ $group: { _id: { $ifNull: ['$source', 'manual'] }, count: { $sum: 1 } } }],
            assignment: [
              {
                $group: {
                  _id: null,
                  assigned: { $sum: { $cond: [{ $ifNull: ['$assignedMechanicId', false] }, 1, 0] } },
                  unassigned: { $sum: { $cond: [{ $ifNull: ['$assignedMechanicId', false] }, 0, 1] } },
                },
              },
            ],
            cost: [{ $group: { _id: null, totalCost: { $sum: { $ifNull: ['$totalCost', 0] } } } }],
            turnaround: [
              { $match: { status: 'completed', completedAt: { $exists: true, $ne: null } } },
              { $project: { hours: { $divide: [{ $subtract: ['$completedAt', '$openedAt'] }, 3600000] } } },
              { $group: { _id: null, averageHours: { $avg: '$hours' }, sampleSize: { $sum: 1 } } },
            ],
            completedMissingTimestamps: [
              {
                $match: {
                  status: 'completed',
                  $or: [{ completedAt: { $exists: false } }, { completedAt: null }],
                },
              },
              { $count: 'count' },
            ],
            byWorkshop: [
              { $group: { _id: { $ifNull: ['$orgUnitId', null] }, count: { $sum: 1 } } },
              {
                $lookup: {
                  from: 'tblorgunits',
                  let: { ouId: '$_id' },
                  pipeline: [
                    { $match: { $expr: { $and: [{ $ne: ['$$ouId', null] }, { $eq: [{ $toString: '$_id' }, { $toString: '$$ouId' }] }] } } },
                    { $project: { name: 1 } },
                  ],
                  as: '__ou',
                },
              },
              { $unwind: { path: '$__ou', preserveNullAndEmptyArrays: true } },
              { $project: { _id: 0, orgUnitId: '$_id', orgUnitName: '$__ou.name', count: 1 } },
              { $sort: { count: -1 } },
            ],
          },
        },
      ])
      .toArray();

    const statusCounts = ALL_STATUSES.reduce(
      (acc, status) => ({ ...acc, [status]: 0 }),
      {} as Record<WorkOrderStatus, number>
    );
    for (const row of (facetResult?.statusCounts ?? []) as Array<{ _id: WorkOrderStatus; count: number }>) {
      if (row._id in statusCounts) statusCounts[row._id] = row.count;
    }

    const priorityCounts = ALL_PRIORITIES.reduce(
      (acc, priority) => ({ ...acc, [priority]: 0 }),
      {} as Record<Priority, number>
    );
    for (const row of (facetResult?.priorityCounts ?? []) as Array<{ _id: Priority; count: number }>) {
      if (row._id in priorityCounts) priorityCounts[row._id] = row.count;
    }

    const sourceCounts: Record<string, number> = { manual: 0, dvir: 0, reminder: 0 };
    for (const row of (facetResult?.sourceCounts ?? []) as Array<{ _id: string; count: number }>) {
      sourceCounts[row._id] = row.count;
    }

    const assignmentRow = (facetResult?.assignment?.[0] ?? { assigned: 0, unassigned: 0 }) as {
      assigned: number;
      unassigned: number;
    };

    const turnaroundRow = facetResult?.turnaround?.[0] as { averageHours: number; sampleSize: number } | undefined;
    const completedMissingTimestamps = (facetResult?.completedMissingTimestamps?.[0]?.count ?? 0) as number;

    return {
      totalCount: (facetResult?.totalCount?.[0]?.count ?? 0) as number,
      statusCounts,
      priorityCounts,
      sourceCounts,
      assignedCount: assignmentRow.assigned,
      unassignedCount: assignmentRow.unassigned,
      totalCost: (facetResult?.cost?.[0]?.totalCost ?? 0) as number,
      turnaround: {
        averageHours: turnaroundRow && turnaroundRow.sampleSize > 0 ? turnaroundRow.averageHours : null,
        sampleSize: turnaroundRow?.sampleSize ?? 0,
        completedMissingTimestamps,
      },
      byWorkshop: (facetResult?.byWorkshop ?? []) as Array<{ orgUnitId: string | null; orgUnitName: string | null; count: number }>,
    };
  }
}

export const workOrderRepository = new WorkOrderRepository();