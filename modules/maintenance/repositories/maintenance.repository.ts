// modules/maintenance/repositories/maintenance.repository.ts

import { BaseRepository } from '@/server/repositories/base.repository';
import {
  Reminder,
  ReminderStatus,
  MaintenanceFilters,
  MaintenanceStats,
} from '@/shared/types/maintenance.types';
import {
  PaginationParams,
  PaginatedResponse,
} from '@/shared/types/common.types';
import { Filter, ObjectId } from 'mongodb';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { EXPORT_ROW_CAP, ExportDataset } from '@/shared/export';

export class MaintenanceRepository extends BaseRepository<Reminder> {
  protected collectionName = 'tblreminders';

  /**
   * Mirrors VehicleRepository.isSuperAdminTenant() / FuelRepository's copy
   * of the same helper. BaseRepository's findMany/findWithPagination
   * already treat these pseudo-tenant values as "no tenant filter"
   * internally (see recalculateOverdueStatuses below, via
   * getActiveFilter()). getMaintenanceStats runs its own raw aggregation
   * pipeline that bypasses BaseRepository, so it must apply the same rule
   * explicitly -- otherwise the stats cards undercount relative to the
   * list endpoint for super-admin sessions, since a strict
   * `tenantId: 'default'` match only picks up reminders whose tenantId
   * field is literally "default" instead of every tenant's data.
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
  ): Promise<PaginatedResponse<Reminder>> {
    return this.findWithPagination(
      {
        license_plate: licensePlate.toUpperCase(),
      } as Filter<Reminder>,
      pagination,
      tenantId
    );
  }

  async getFilteredReminders(
    filters: MaintenanceFilters,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Reminder>> {
    const filter: Record<string, unknown> = {};

    if (filters.license_plate) {
      filter.license_plate = {
        $regex: filters.license_plate,
        $options: 'i',
      };
    }
    if (filters.status) filter.status = filters.status;
    if (filters.priority) filter.priority = filters.priority;
    if (filters.category) filter.category = filters.category;
    if (filters.assigned_to) filter.assigned_to = filters.assigned_to;
    if (filters.startDate || filters.endDate) {
      filter.due_date = {};
      if (filters.startDate)
        (filter.due_date as any).$gte = filters.startDate;
      if (filters.endDate)
        (filter.due_date as any).$lte = filters.endDate;
    }

    return this.findWithPagination(
      filter as Filter<Reminder>,
      pagination,
      tenantId
    );
  }

  /**
   * Org/branch-scoped variant of getFilteredReminders. Mirrors
   * VehicleRepository.getFilteredVehiclesInScope: same filters, plus
   * tenantScopeService.buildFilter(context, 'orgUnitId') on top of (not
   * instead of) tenant isolation.
   */
  /**
   * Single source of truth for the tenant + org-unit-scope + filter
   * query shared by getFilteredRemindersInScope (paginated list) and
   * getFilteredRemindersForExport (uncapped-by-pagination export).
   */
  private buildScopedQuery(filters: MaintenanceFilters, context: TenantContext): Record<string, unknown> {
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
    if (filters.status) query.status = filters.status;
    if (filters.priority) query.priority = filters.priority;
    if (filters.category) query.category = filters.category;
    if (filters.assigned_to) query.assigned_to = filters.assigned_to;
    if (filters.startDate || filters.endDate) {
      query.due_date = {};
      if (filters.startDate) (query.due_date as any).$gte = filters.startDate;
      if (filters.endDate) (query.due_date as any).$lte = filters.endDate;
    }

    const scopeFilter = tenantScopeService.buildFilter<Reminder>(context, 'orgUnitId');
    Object.assign(query, scopeFilter);

    return query;
  }

  async getFilteredRemindersInScope(
    filters: MaintenanceFilters,
    context: TenantContext,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Reminder>> {
    const collection = await this.getCollection();
    const query = this.buildScopedQuery(filters, context);

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      collection
        .find(query as Filter<Reminder>)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments(query as Filter<Reminder>),
    ]);

    return {
      data: data as Reminder[],
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
   * Export variant of getFilteredRemindersInScope: same filters and
   * same tenant/org-unit scope, but returns up to `cap` matching
   * records (default EXPORT_ROW_CAP) ignoring UI pagination, plus the
   * true total match count so the caller can detect truncation.
   */
  async getFilteredRemindersForExport(
    filters: MaintenanceFilters,
    context: TenantContext,
    cap: number = EXPORT_ROW_CAP
  ): Promise<ExportDataset<Reminder>> {
    const collection = await this.getCollection();
    const query = this.buildScopedQuery(filters, context);

    const [rows, totalMatched] = await Promise.all([
      collection
        .find(query as Filter<Reminder>)
        .sort({ createdAt: -1 })
        .limit(cap)
        .toArray(),
      collection.countDocuments(query as Filter<Reminder>),
    ]);

    return {
      rows: rows as Reminder[],
      totalMatched,
      truncated: totalMatched > rows.length,
      exportCap: cap,
    };
  }

  /**
   * FIX: previously filtered on `status: 'pending'`, which is the exact
   * bug `getMaintenanceStats` below was already fixed for -- once the
   * cron (recalculateOverdueStatuses) flips a reminder's stored status
   * to the literal string 'overdue', it stopped matching this filter and
   * disappeared from the Overdue Maintenance page / `/api/reminders?action=overdue`
   * while `getMaintenanceStats().overdue` (and now the dashboard widget,
   * see useDashboardData.ts) still counted it. "Overdue" must be defined
   * by business meaning (unresolved AND past due), independent of
   * whichever status string currently happens to be stored -- identical
   * rule to getMaintenanceStats, so this method, the stats cards, and the
   * dashboard widget can never contradict each other again.
   */
  async getOverdueReminders(tenantId: string): Promise<Reminder[]> {
    const now = new Date();
    return this.findMany(
      {
        status: { $nin: ['completed', 'cancelled'] },
        due_date: { $lt: now },
      } as Filter<Reminder>,
      tenantId
    );
  }

  /**
   * FIX: same class of bug as getOverdueReminders above -- "upcoming"
   * must mean unresolved AND not yet due, independent of the literal
   * status string stored (a reminder legitimately becomes upcoming again
   * after recalculateOverdueStatuses reverts it from 'overdue' back to
   * 'pending', but should not silently disappear from this list for any
   * other unresolved status value that might exist).
   */
  async getUpcomingReminders(
    tenantId: string,
    daysAhead: number = 7
  ): Promise<Reminder[]> {
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + daysAhead);

    return this.findMany(
      {
        status: { $nin: ['completed', 'cancelled'] },
        due_date: { $gte: now, $lte: future },
      } as Filter<Reminder>,
      tenantId
    );
  }

  /**
   * FIX: previously counted overdue as `{status:'pending', due_date:$lt:now}`.
   * Once the cron (recalculateOverdueStatuses) flips a record's status to
   * the literal string 'overdue', it stops matching that filter and
   * disappears from BOTH the pending and overdue buckets while still
   * counting toward `total` -- producing exactly the "0 Overdue" vs
   * "5 records show Overdue" contradiction. Overdue must be defined by
   * business meaning (not yet resolved, past due), independent of which
   * exact status string is currently stored.
   */
  async getMaintenanceStats(tenantId: string): Promise<MaintenanceStats> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const filter: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (!isSuperAdmin) filter.tenantId = tenantId;

    const now = new Date();
    const UNRESOLVED = { $nin: ['completed', 'cancelled'] };

    const [total, completed, overdue, pending] = await Promise.all([
      collection.countDocuments(filter as Filter<Reminder>),
      collection.countDocuments({ ...filter, status: 'completed' } as Filter<Reminder>),
      collection.countDocuments({
        ...filter,
        status: UNRESOLVED,
        due_date: { $lt: now },
      } as Filter<Reminder>),
      collection.countDocuments({
        ...filter,
        status: UNRESOLVED,
        due_date: { $gte: now },
      } as Filter<Reminder>),
    ]);

    const completionDaysPipeline = [
      { $match: { ...filter, status: 'completed', completion_date: { $exists: true } } },
      {
        $project: {
          daysDiff: {
            $dateDiff: { startDate: '$due_date', endDate: '$completion_date', unit: 'day' },
          },
        },
      },
      { $group: { _id: null, avgDays: { $avg: '$daysDiff' } } },
    ];
    const avgResult = await collection.aggregate(completionDaysPipeline).toArray();
    const averageCompletionDays = Math.round(avgResult[0]?.avgDays || 0);

    return {
      total,
      completed,
      pending,
      overdue,
      completionRate: total > 0 ? (completed / total) * 100 : 0,
      averageCompletionDays,
    };
  }

  async completeReminder(
    id: string,
    tenantId: string,
    userId?: string,
    completionDate?: Date
  ): Promise<Reminder | null> {
    return this.update(
      id,
      {
        status: 'completed' as ReminderStatus,
        completion_date: completionDate ?? new Date(),
      },
      tenantId,
      userId
    );
  }

  /**
   * Recalculates pending/overdue status for every non-completed reminder
   * in `tenantId` based on the current date, using two batched
   * `updateMany` calls rather than a full collection scan with a
   * per-document write (the approach the legacy
   * lib/updateReminderStatuses.ts took).
   *
   * Pass tenantId === 'system' (or 'default') to run this across ALL
   * tenants at once -- BaseRepository's tenant filter treats those values
   * as "no tenant filter", which is exactly what the scheduled jobs
   * (notify-overdue, update-status) need today, since reminders aren't
   * yet partitioned per-tenant at the job-scheduling level (see Phase 7,
   * True Multi-Tenancy, still pending).
   *
   * Returns the reminders that just transitioned from pending -> overdue
   * (not ones already overdue) so the caller can notify their assignees
   * exactly once per transition, never on every cron tick.
   */
  async recalculateOverdueStatuses(
    tenantId: string
  ): Promise<{ updatedCount: number; newlyOverdue: Reminder[] }> {
    const collection = await this.getCollection();
    const now = new Date();
    const baseFilter = this.getActiveFilter(tenantId);

    const newlyOverdue = await collection
      .find({
        ...baseFilter,
        status: 'pending',
        due_date: { $lt: now },
      } as Filter<Reminder>)
      .toArray();

    const overdueResult = newlyOverdue.length
      ? await collection.updateMany(
          {
            _id: { $in: newlyOverdue.map((r) => new ObjectId(r._id)) },
          } as unknown as Filter<Reminder>, // fix: use `unknown` to bypass strict cast
          { $set: { status: 'overdue', updatedAt: now } }
        )
      : { modifiedCount: 0 };

    // Reminders previously marked overdue whose due_date has since moved
    // into the future (e.g. edited/rescheduled) revert to pending.
    const revertResult = await collection.updateMany(
      {
        ...baseFilter,
        status: 'overdue',
        due_date: { $gte: now },
      } as Filter<Reminder>,
      { $set: { status: 'pending', updatedAt: now } }
    );

    return {
      updatedCount: overdueResult.modifiedCount + revertResult.modifiedCount,
      newlyOverdue,
    };
  }

  // ---------------------------------------------------------------------
  // Enterprise analytics additions (Maintenance Analytics Enhancement)
  // ---------------------------------------------------------------------

  /** Monthly cost trend across completed records, based on estimated_cost. */
  async getCostTrend(
    tenantId: string,
    months: number = 12
  ): Promise<import('@/shared/types/maintenance.types').MaintenanceCostTrendPoint[]> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const match: Record<string, unknown> = {
      isDeleted: { $ne: true },
      status: 'completed',
      completion_date: { $gte: startDate },
    };
    if (!isSuperAdmin) match.tenantId = tenantId;

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$completion_date' } },
          totalCost: { $sum: { $ifNull: ['$estimated_cost', 0] } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({
      month: r._id as string,
      totalCost: Math.round((r.totalCost as number) * 100) / 100,
      count: r.count as number,
    }));
  }

  /** Completed-record count per vehicle, ranked descending -- "which vehicles need work most often". */
  async getRepairFrequencyByVehicle(
    tenantId: string,
    limit: number = 20
  ): Promise<import('@/shared/types/maintenance.types').RepairFrequencyByVehicleRow[]> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);
    const match: Record<string, unknown> = { isDeleted: { $ne: true }, status: 'completed' };
    if (!isSuperAdmin) match.tenantId = tenantId;

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: '$license_plate',
          count: { $sum: 1 },
          totalCost: { $sum: { $ifNull: ['$estimated_cost', 0] } },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit },
      {
        $project: {
          license_plate: '$_id',
          count: 1,
          totalCost: { $round: [{ $ifNull: ['$totalCost', 0] }, 2] },
          _id: 0,
        },
      },
    ];

    return collection.aggregate(pipeline).toArray() as unknown as Promise<
      import('@/shared/types/maintenance.types').RepairFrequencyByVehicleRow[]
    >;
  }

  /** Vehicles ranked by cumulative estimated maintenance cost. */
  async getMostExpensiveVehicles(
    tenantId: string,
    limit: number = 20
  ): Promise<import('@/shared/types/maintenance.types').MostExpensiveVehicleRow[]> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);
    const match: Record<string, unknown> = { isDeleted: { $ne: true }, status: 'completed' };
    if (!isSuperAdmin) match.tenantId = tenantId;

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: '$license_plate',
          totalCost: { $sum: { $ifNull: ['$estimated_cost', 0] } },
          recordCount: { $sum: 1 },
        },
      },
      { $sort: { totalCost: -1 } },
      { $limit: limit },
      {
        $project: {
          license_plate: '$_id',
          totalCost: { $round: [{ $ifNull: ['$totalCost', 0] }, 2] },
          recordCount: 1,
          _id: 0,
        },
      },
    ];

    return collection.aggregate(pipeline).toArray() as unknown as Promise<
      import('@/shared/types/maintenance.types').MostExpensiveVehicleRow[]
    >;
  }

  /**
   * Approximate per-vehicle downtime: average days between due_date and
   * completion_date across completed records. This is a PROXY for actual
   * out-of-service duration -- Reminder has no dedicated downtime-start/
   * downtime-end fields today (see MaintenanceCostTrendPoint doc comment
   * for the same caveat applied to cost). Negative averages (completed
   * before due) are floored to 0 rather than shown as "negative downtime".
   */
  async getDowntimeEstimate(
    tenantId: string,
    limit: number = 20
  ): Promise<import('@/shared/types/maintenance.types').DowntimeEstimatePoint[]> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);
    const match: Record<string, unknown> = {
      isDeleted: { $ne: true },
      status: 'completed',
      completion_date: { $exists: true },
    };
    if (!isSuperAdmin) match.tenantId = tenantId;

    const pipeline = [
      { $match: match },
      {
        $project: {
          license_plate: 1,
          daysDiff: {
            $dateDiff: { startDate: '$due_date', endDate: '$completion_date', unit: 'day' },
          },
        },
      },
      {
        $group: {
          _id: '$license_plate',
          avgDays: { $avg: '$daysDiff' },
          count: { $sum: 1 },
        },
      },
      { $sort: { avgDays: -1 } },
      { $limit: limit },
      {
        $project: {
          license_plate: '$_id',
          estimatedDowntimeDays: { $round: [{ $max: [0, '$avgDays'] }, 1] },
          recordCount: '$count',
          _id: 0,
        },
      },
    ];

    return collection.aggregate(pipeline).toArray() as unknown as Promise<
      import('@/shared/types/maintenance.types').DowntimeEstimatePoint[]
    >;
  }
}

export const maintenanceRepository = new MaintenanceRepository();