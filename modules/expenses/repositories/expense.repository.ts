// modules/expenses/repositories/expense.repository.ts

import { Filter, ObjectId } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import {
  Expense,
  ExpenseFilters,
  ExpenseStats,
  ExpenseCategoryOverTimePoint,
  TopVehicleExpenseRow,
  VehicleExpenseBreakdownRow,
  ExpenseAmountDistributionBucket,
  JobTripExpenseRow,
} from '@/shared/types/expense.types';
import {
  PaginationParams,
  PaginatedResponse,
  DateRange,
} from '@/shared/types/common.types';

export class ExpenseRepository extends BaseRepository<Expense> {
  protected collectionName = 'tblexpenses';

  private isSuperAdminTenant(tenantId: string): boolean {
    return (
      tenantId === 'default' ||
      tenantId === 'system' ||
      tenantId === 'super_admin'
    );
  }

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

  /** Shared tenant + date-range match builder for every analytics aggregation below. */
  private buildBaseMatch(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Record<string, unknown> {
    const match: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (!this.isSuperAdminTenant(tenantId)) match.tenantId = tenantId;
    if (dateRange?.startDate || dateRange?.endDate) {
      match.date = {};
      if (dateRange.startDate) (match.date as any).$gte = dateRange.startDate;
      if (dateRange.endDate) (match.date as any).$lte = dateRange.endDate;
    }
    return match;
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
      byType: Object.fromEntries(data.byType.map((t: any) => [t._id || 'All', t.total])),
      byMonth: Object.fromEntries(data.byMonth.map((m: any) => [m._id, m.total])),
      topCategories: data.topCategories.map((c: any) => ({
        name: c._id || 'All',
        amount: c.total,
      })),
    };
  }

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

  // ------------------------------------------------------------------
  // Enterprise analytics additions
  // ------------------------------------------------------------------

  /**
   * Category totals per month. Powers both the stacked
   * category-over-time chart and the category x month heatmap -- same
   * shape, two visualizations, so we aggregate it once.
   */
  async getExpenseCategoryOverTime(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<ExpenseCategoryOverTimePoint[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange);

    const pipeline = [
      { $match: match },
      ...this.expenseTypeLookupStages(),
      {
        $group: {
          _id: {
            category: { $ifNull: ['$expense_type.name', 'Uncategorized'] },
            month: { $dateToString: { format: '%Y-%m', date: '$date' } },
          },
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.month': 1 } },
      {
        $project: {
          _id: 0,
          category: '$_id.category',
          month: '$_id.month',
          amount: { $round: ['$amount', 2] },
          count: 1,
        },
      },
    ];

    return collection.aggregate<ExpenseCategoryOverTimePoint>(pipeline).toArray();
  }

  /**
   * Top vehicles by total expense spend, with each vehicle's single
   * biggest category. Uses $sortArray (Mongo 5.2+) to pick the top
   * category from a pushed per-category array rather than a second
   * round-trip query.
   */
  async getTopVehiclesByExpense(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10
  ): Promise<TopVehicleExpenseRow[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange);

    const pipeline = [
      { $match: match },
      ...this.expenseTypeLookupStages(),
      {
        $group: {
          _id: {
            plate: '$license_plate',
            category: { $ifNull: ['$expense_type.name', 'Uncategorized'] },
          },
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.plate',
          totalAmount: { $sum: '$amount' },
          expenseCount: { $sum: '$count' },
          categories: { $push: { category: '$_id.category', amount: '$amount' } },
        },
      },
      {
        $addFields: {
          sortedCategories: { $sortArray: { input: '$categories', sortBy: { amount: -1 } } },
        },
      },
      {
        $project: {
          _id: 0,
          license_plate: '$_id',
          totalAmount: { $round: ['$totalAmount', 2] },
          expenseCount: 1,
          topCategory: { $arrayElemAt: ['$sortedCategories.category', 0] },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: limit },
    ];

    return collection.aggregate<TopVehicleExpenseRow>(pipeline).toArray();
  }

  /**
   * Per-category spend for the top N vehicles by total spend -- powers
   * the vehicle x category stacked bar. Two-stage: first find the top
   * vehicle plates, then aggregate their category breakdown in a single
   * follow-up query (no N+1: one query per stage, not per vehicle).
   */
  async getVehicleExpenseBreakdown(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    vehicleLimit: number = 8
  ): Promise<VehicleExpenseBreakdownRow[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange);

    const topPlatesPipeline = [
      { $match: match },
      { $group: { _id: '$license_plate', totalAmount: { $sum: '$amount' } } },
      { $sort: { totalAmount: -1 } },
      { $limit: vehicleLimit },
    ];
    const topPlates = await collection.aggregate(topPlatesPipeline).toArray();
    const plates = topPlates.map((p) => p._id as string);
    if (plates.length === 0) return [];

    const pipeline = [
      { $match: { ...match, license_plate: { $in: plates } } },
      ...this.expenseTypeLookupStages(),
      {
        $group: {
          _id: {
            plate: '$license_plate',
            category: { $ifNull: ['$expense_type.name', 'Uncategorized'] },
          },
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          license_plate: '$_id.plate',
          category: '$_id.category',
          amount: { $round: ['$amount', 2] },
          count: 1,
        },
      },
    ];

    return collection.aggregate<VehicleExpenseBreakdownRow>(pipeline).toArray();
  }

  /** Histogram buckets via $bucketAuto -- mirrors FuelRepository.getFuelCostDistribution. */
  async getExpenseAmountDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date }
  ): Promise<ExpenseAmountDistributionBucket[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange);

    const count = await collection.countDocuments(match as Filter<Expense>);
    if (count === 0) return [];

    const bucketCount = Math.min(8, count);
    const pipeline = [
      { $match: match },
      {
        $bucketAuto: {
          groupBy: '$amount',
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
   * Job/Trip spend broken down by category, for the top N jobs/trips
   * by total spend. Same two-stage shape as getVehicleExpenseBreakdown.
   * Records with no jobTrip are grouped under "No Job/Trip".
   */
  async getJobTripExpenseAnalysis(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    jobLimit: number = 10
  ): Promise<JobTripExpenseRow[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange);

    const jobKeyExpr = {
      $cond: [
        { $and: [{ $ne: ['$jobTrip', null] }, { $ne: ['$jobTrip', ''] }] },
        '$jobTrip',
        'No Job/Trip',
      ],
    };

    const topJobsPipeline = [
      { $match: match },
      { $addFields: { __job: jobKeyExpr } },
      { $group: { _id: '$__job', totalAmount: { $sum: '$amount' } } },
      { $sort: { totalAmount: -1 } },
      { $limit: jobLimit },
    ];
    const topJobs = await collection.aggregate(topJobsPipeline).toArray();
    const jobs = topJobs.map((j) => j._id as string);
    if (jobs.length === 0) return [];

    const pipeline = [
      { $match: match },
      { $addFields: { __job: jobKeyExpr } },
      { $match: { __job: { $in: jobs } } },
      ...this.expenseTypeLookupStages(),
      {
        $group: {
          _id: {
            job: '$__job',
            category: { $ifNull: ['$expense_type.name', 'Uncategorized'] },
          },
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          jobTrip: '$_id.job',
          category: '$_id.category',
          amount: { $round: ['$amount', 2] },
          count: 1,
        },
      },
    ];

    return collection.aggregate<JobTripExpenseRow>(pipeline).toArray();
  }
}

export const expenseRepository = new ExpenseRepository();