// modules/expenses/repositories/expense.repository.ts

import { Filter, ObjectId } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import {
  Expense,
  ExpenseFilters,
  ExpenseStats,
} from '@/shared/types/expense.types';
import {
  PaginationParams,
  PaginatedResponse,
  DateRange,
} from '@/shared/types/common.types';

export class ExpenseRepository extends BaseRepository<Expense> {
  protected collectionName = 'tblexpenses';

  /**
   * FIX (dashboard/stats showing $0 or wrong totals while the list page
   * is correct): getFilteredExpenses() below has always treated
   * tenantId === 'default' | 'system' | 'super_admin' as a sentinel
   * meaning "org owner / super admin -- do not filter by tenantId at
   * all", matching the same pattern used by VehicleRepository,
   * FuelRepository, MaintenanceRepository, and TripRepository.
   * getExpenseStats(), getMonthlyTrends(), and getExpenseAnalytics()
   * did NOT apply this same bypass -- they always did a strict
   * `tenantId` equality match. That's a silent, structural
   * inconsistency: whenever the literal tenantId returned by
   * getTenantFromRequest() (the sentinel 'default') doesn't exactly
   * match what's stored on a given expense document's `tenantId`
   * field, the list page (bypassed, sees everything) and the stats/
   * trend/category-chart endpoints (strictly filtered) silently
   * disagree -- exactly the "$190 in stats vs 101 in the list" and
   * later "$0 in stats vs however many are actually in the list"
   * symptoms this app hit. This single helper is now shared by every
   * read method in this repository so they can never drift apart
   * again.
   */
  private isSuperAdminTenant(tenantId: string): boolean {
    return (
      tenantId === 'default' ||
      tenantId === 'system' ||
      tenantId === 'super_admin'
    );
  }

  /**
   * Every expense returned anywhere in the app (list, dashboard, export)
   * must carry a populated `expense_type`, or the category column falls
   * back to "Other"/"Uncategorized" and dropdowns leak raw ObjectIds.
   * This is the single shared lookup stage every read path below uses.
   */
  private expenseTypeLookupStages() {
    return [
      {
        $lookup: {
          from: 'tblexpense_types',
          localField: 'expense_type_id',
          foreignField: '_id',
          as: 'expense_type',
        },
      },
      { $unwind: { path: '$expense_type', preserveNullAndEmptyArrays: true } },
    ];
  }

  async findByLicensePlate(
    licensePlate: string,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Expense>> {
    return this.getFilteredExpenses(
      { license_plate: licensePlate.toUpperCase() },
      tenantId,
      pagination
    );
  }

  /**
   * Powers: /api/expenses (list + legacy non-paginated dashboard path),
   * CSV/Excel export, vehicle expense history. Uses an aggregation
   * pipeline (not BaseRepository.findWithPagination) specifically so
   * expense_type is always populated -- this was previously missing,
   * which is why category showed as "Uncategorized" or a raw ObjectId
   * everywhere except the stats cards.
   */
  async getFilteredExpenses(
    filters: ExpenseFilters,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Expense>> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const match: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (!isSuperAdmin) match.tenantId = tenantId;

    if (filters.license_plate) {
      match.license_plate = { $regex: filters.license_plate, $options: 'i' };
    }
    if (filters.type) {
      match.expense_type_id = new ObjectId(filters.type);
    }
    if (filters.startDate || filters.endDate) {
      match.date = {};
      if (filters.startDate) (match.date as any).$gte = filters.startDate;
      if (filters.endDate) (match.date as any).$lte = filters.endDate;
    }
    if (filters.minAmount !== undefined) {
      match.amount = { $gte: filters.minAmount };
    }
    if (filters.maxAmount !== undefined) {
      match.amount = { ...(match.amount as object), $lte: filters.maxAmount };
    }

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      collection
        .aggregate<Expense>([
          { $match: match },
          ...this.expenseTypeLookupStages(),
          { $sort: { date: -1 } },
          { $skip: skip },
          { $limit: limit },
        ])
        .toArray(),
      collection.aggregate([{ $match: match }, { $count: 'count' }]).toArray(),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return {
      data,
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
   * FIX: now applies the same isSuperAdminTenant() bypass as
   * getFilteredExpenses() above. Powers the "Total expenses",
   * "Average expense", "Categories used", and "Top category" cards on
   * both the Expenses dashboard (ExpenseStatsCards) and the main
   * Fleet dashboard (KPIsWidget / useExpenseBreakdownWidget).
   */
  async getExpenseStats(
    tenantId: string,
    dateRange?: DateRange
  ): Promise<ExpenseStats> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const filter: Record<string, unknown> = {
      isDeleted: { $ne: true },
    };
    if (!isSuperAdmin) {
      filter.tenantId = tenantId;
    }

    if (dateRange) {
      filter.date = { $gte: dateRange.startDate, $lte: dateRange.endDate };
    }

    const pipeline = [
      { $match: filter },
      ...this.expenseTypeLookupStages(),
      {
        $facet: {
          total: [{ $group: { _id: null, total: { $sum: '$amount' } } }],
          count: [{ $count: 'count' }],
          byType: [
            { $group: { _id: '$expense_type.name', total: { $sum: '$amount' } } },
            { $sort: { total: -1 } },
          ],
          byMonth: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
                total: { $sum: '$amount' },
              },
            },
            { $sort: { _id: 1 } },
          ],
          topCategories: [
            { $group: { _id: '$expense_type.name', total: { $sum: '$amount' } } },
            { $sort: { total: -1 } },
            { $limit: 5 },
          ],
        },
      },
    ];

    const result = await collection.aggregate(pipeline).toArray();
    const data = result[0] || { total: [], count: [], byType: [], byMonth: [], topCategories: [] };

    const totalAmount: number = data.total[0]?.total || 0;
    const totalCount: number = data.count[0]?.count || 0;

    return {
      total: totalAmount,
      average: totalCount > 0 ? totalAmount / totalCount : 0,
      byType: Object.fromEntries(data.byType.map((t: any) => [t._id || 'Uncategorized', t.total])),
      byMonth: Object.fromEntries(data.byMonth.map((m: any) => [m._id, m.total])),
      topCategories: data.topCategories.map((c: any) => ({
        name: c._id || 'Uncategorized',
        amount: c.total,
      })),
    };
  }

  /**
   * FIX: now applies the same isSuperAdminTenant() bypass. Powers the
   * "Monthly expense trend" chart on the Expenses dashboard.
   */
  async getMonthlyTrends(
    tenantId: string,
    months: number = 12
  ): Promise<Array<{ month: string; total: number }>> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isSuperAdminTenant(tenantId);

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const match: Record<string, unknown> = {
      isDeleted: { $ne: true },
      date: { $gte: startDate },
    };
    if (!isSuperAdmin) {
      match.tenantId = tenantId;
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({ month: r._id, total: r.total }));
  }

  /**
   * FIX: now applies the same isSuperAdminTenant() bypass. Powers the
   * "Expense distribution" / category chart on the Expenses dashboard.
   */
  async getExpenseAnalytics(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any[]> {
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
      ...this.expenseTypeLookupStages(),
      {
        $group: {
          _id: {
            category: '$expense_type.name',
            month: { $dateToString: { format: '%Y-%m', date: '$date' } },
          },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.month': 1 } },
    ];

    return collection.aggregate(pipeline).toArray();
  }
}

export const expenseRepository = new ExpenseRepository();