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
}

export const maintenanceRepository = new MaintenanceRepository();