import { resolveTenantScope } from '@/server/tenancy/tenant-scope';
import { prefixMatch, containsMatch } from '@/shared/utils/regex.utils';
// modules/expenses/repositories/expense.repository.ts

import { Filter, ObjectId } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import {
  Expense,
  ExpenseFilters,
  ExpenseStats,
  ExpenseCategoryOverTimePoint,
  CategorySummary,
  TopVehicleExpenseRow,
  VehicleExpenseBreakdownRow,
  ExpenseAmountDistributionBucket,
  JobTripExpenseRow,
  TopExpenseTransactionRow,
  DailyExpenseTotal,
  ExpenseOutlierRow,
} from '@/shared/types/expense.types';
import {
  PaginationParams,
  PaginatedResponse,
  DateRange,
} from '@/shared/types/common.types';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';
import { EXPORT_ROW_CAP, ExportDataset } from '@/shared/export';
import { AnalyticsScope } from '@/shared/types/analytics-scope.types';
import { analyticsScopeService } from '@/modules/analytics/services/analytics-scope.service';

export class ExpenseRepository extends BaseRepository<Expense> {
  protected collectionName = 'tblexpenses';

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

  /**
   * Shared tenant + date-range + analytics-scope match stage, mirroring
   * FuelRepository.buildBaseMatch. Omitting `scope` (or passing a fleet
   * scope) reproduces today's fleet-wide behaviour exactly.
   */
  private buildBaseMatch(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Record<string, unknown> {
    let match: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (!this.isPlatformScopeTenant(tenantId)) match.tenantId = tenantId;
    if (dateRange?.startDate || dateRange?.endDate) {
      match.date = {};
      if (dateRange.startDate) (match.date as any).$gte = dateRange.startDate;
      if (dateRange.endDate) (match.date as any).$lte = dateRange.endDate;
    }
    match = analyticsScopeService.applyScope(match, scope);
    // FIX (Phase B -- repository/analytics scoping completeness): mirrors
    // FuelRepository.buildBaseMatch -- analytics previously isolated only
    // by tenantId, never by org unit, so Branch/Fleet/Workshop Manager
    // dashboards silently showed org-wide totals while buildScopedMatch
    // (list page) was already correctly org-unit scoped.
    if (context) {
      const orgUnitFilter = tenantScopeService.buildFilter<Expense>(context, 'orgUnitId');
      match = { ...match, ...orgUnitFilter };
    }
    return match;
  }

  /** Previous period of equal length immediately preceding a given range, for MoM/period-over-period comparisons. */
  private previousPeriodMatch(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Record<string, unknown> | null {
    if (!dateRange?.startDate || !dateRange?.endDate) return null;
    const periodMs = dateRange.endDate.getTime() - dateRange.startDate.getTime();
    const prevEnd = new Date(dateRange.startDate.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - periodMs);
    return this.buildBaseMatch(tenantId, { startDate: prevStart, endDate: prevEnd }, scope, context);
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
    const isSuperAdmin = this.isPlatformScopeTenant(tenantId);

    const match: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (!isSuperAdmin) match.tenantId = tenantId;

    if (filters.license_plate) {
      match.license_plate = containsMatch(filters.license_plate);
    }
    if (filters.type) {
      match.expense_type_id = new ObjectId(filters.type);
    }
    if (filters.jobTrip) {
      match.jobTrip =
        filters.jobTrip === 'No Job/Trip'
          ? { $in: [null, ''] }
          : { $regex: `^${filters.jobTrip}$`, $options: 'i' };
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

  private buildScopedMatch(filters: ExpenseFilters, context: TenantContext): Record<string, unknown> {
    const match: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (!this.isPlatformScopeTenant(context.organizationId)) {
      match.tenantId = context.organizationId;
    }

    if (filters.license_plate) {
      match.license_plate = containsMatch(filters.license_plate);
    }
    if (filters.type) {
      match.expense_type_id = new ObjectId(filters.type);
    }
    if (filters.jobTrip) {
      match.jobTrip =
        filters.jobTrip === 'No Job/Trip'
          ? { $in: [null, ''] }
          : { $regex: `^${filters.jobTrip}$`, $options: 'i' };
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

    const scopeFilter = tenantScopeService.buildFilter<Expense>(context, 'orgUnitId');
    Object.assign(match, scopeFilter);

    return match;
  }

  async getFilteredExpensesInScope(
    filters: ExpenseFilters,
    context: TenantContext,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Expense>> {
    const collection = await this.getCollection();
    const match = this.buildScopedMatch(filters, context);

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

  async getFilteredExpensesForExport(
    filters: ExpenseFilters,
    context: TenantContext,
    cap: number = EXPORT_ROW_CAP
  ): Promise<ExportDataset<Expense>> {
    const collection = await this.getCollection();
    const match = this.buildScopedMatch(filters, context);

    const [rows, totalResult] = await Promise.all([
      collection
        .aggregate<Expense>([
          { $match: match },
          ...this.expenseTypeLookupStages(),
          { $sort: { date: -1 } },
          { $limit: cap },
        ])
        .toArray(),
      collection.aggregate([{ $match: match }, { $count: 'count' }]).toArray(),
    ]);

    const totalMatched = totalResult[0]?.count ?? 0;

    return {
      rows,
      totalMatched,
      truncated: totalMatched > rows.length,
      exportCap: cap,
    };
  }

  async getExpenseStats(
    tenantId: string,
    dateRange?: DateRange,
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<ExpenseStats> {
    const collection = await this.getCollection();

    let filter: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (!this.isPlatformScopeTenant(tenantId)) filter.tenantId = tenantId;
    if (dateRange) {
      filter.date = { $gte: dateRange.startDate, $lte: dateRange.endDate };
    }
    filter = analyticsScopeService.applyScope(filter, scope);

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
    months: number = 12,
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<Array<{ month: string; total: number }>> {
    const collection = await this.getCollection();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const match = this.buildBaseMatch(tenantId, { startDate }, scope, context);

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
    endDate: Date,
    context?: TenantContext
  ): Promise<any[]> {
    const collection = await this.getCollection();
    const isSuperAdmin = this.isPlatformScopeTenant(tenantId);

    const match: Record<string, unknown> = {
      isDeleted: { $ne: true },
      date: { $gte: startDate, $lte: endDate },
    };
    if (!isSuperAdmin) match.tenantId = tenantId;
    // FIX (Phase B): this legacy aggregation had no org-unit scoping at
    // all (not even the buildBaseMatch AnalyticsScope narrowing) -- add
    // the same optional context-based scoping as every other method here.
    if (context) {
      const orgUnitFilter = tenantScopeService.buildFilter<Expense>(context, 'orgUnitId');
      Object.assign(match, orgUnitFilter);
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

  async getExpenseCategoryOverTime(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<ExpenseCategoryOverTimePoint[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange, scope, context);

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

  async getExpenseCategorySummary(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<CategorySummary[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange, scope, context);

    const grandTotalResult = await collection
      .aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$amount' } } }])
      .toArray();
    const grandTotal: number = grandTotalResult[0]?.total || 0;

    const summaryPipeline = [
      { $match: match },
      ...this.expenseTypeLookupStages(),
      {
        $group: {
          _id: { $ifNull: ['$expense_type.name', 'Uncategorized'] },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
          min: { $min: '$amount' },
          max: { $max: '$amount' },
          latestDate: { $max: '$date' },
        },
      },
    ];
    const summaries = await collection.aggregate(summaryPipeline).toArray();

    const byVehiclePipeline = [
      { $match: match },
      ...this.expenseTypeLookupStages(),
      {
        $group: {
          _id: {
            category: { $ifNull: ['$expense_type.name', 'Uncategorized'] },
            plate: '$license_plate',
          },
          amount: { $sum: '$amount' },
        },
      },
    ];
    const byVehicle = await collection.aggregate(byVehiclePipeline).toArray();
    const topVehicleByCategory = new Map<string, { plate: string; amount: number }>();
    for (const row of byVehicle) {
      const cat = row._id.category as string;
      const current = topVehicleByCategory.get(cat);
      if (!current || row.amount > current.amount) {
        topVehicleByCategory.set(cat, { plate: row._id.plate, amount: row.amount });
      }
    }

    const prevMatch = this.previousPeriodMatch(tenantId, dateRange, scope, context);
    let prevTotalsByCategory = new Map<string, number>();
    if (prevMatch) {
      const prevPipeline = [
        { $match: prevMatch },
        ...this.expenseTypeLookupStages(),
        {
          $group: {
            _id: { $ifNull: ['$expense_type.name', 'Uncategorized'] },
            total: { $sum: '$amount' },
          },
        },
      ];
      const prevResults = await collection.aggregate(prevPipeline).toArray();
      prevTotalsByCategory = new Map(prevResults.map((r) => [r._id as string, r.total as number]));
    }

    return summaries
      .map((s) => {
        const category = s._id as string;
        const prevTotal = prevTotalsByCategory.get(category);
        const momChangePercent =
          prevMatch && prevTotal !== undefined && prevTotal > 0
            ? Math.round(((s.total - prevTotal) / prevTotal) * 1000) / 10
            : null;

        return {
          category,
          total: Math.round(s.total * 100) / 100,
          count: s.count,
          average: s.count > 0 ? Math.round((s.total / s.count) * 100) / 100 : 0,
          min: Math.round(s.min * 100) / 100,
          max: Math.round(s.max * 100) / 100,
          latestDate: s.latestDate ? new Date(s.latestDate).toISOString() : null,
          topVehicle: topVehicleByCategory.get(category)?.plate ?? null,
          percentageOfTotal: grandTotal > 0 ? Math.round((s.total / grandTotal) * 1000) / 10 : 0,
          momChangePercent,
        };
      })
      .sort((a, b) => b.total - a.total);
  }

  async getTopVehiclesByExpense(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10,
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<TopVehicleExpenseRow[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange, scope, context);

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

    const rows = await collection.aggregate(pipeline).toArray();

    const plates = rows.map((r) => r.license_plate as string);
    const detailMap = new Map<string, { min: number; max: number; latestDate: Date | null }>();
    if (plates.length > 0) {
      const detailPipeline = [
        { $match: { ...match, license_plate: { $in: plates } } },
        {
          $group: {
            _id: '$license_plate',
            min: { $min: '$amount' },
            max: { $max: '$amount' },
            latestDate: { $max: '$date' },
          },
        },
      ];
      const details = await collection.aggregate(detailPipeline).toArray();
      for (const d of details) {
        detailMap.set(d._id as string, { min: d.min, max: d.max, latestDate: d.latestDate });
      }
    }

    const prevMatch = this.previousPeriodMatch(tenantId, dateRange, scope, context);
    let prevTotalsByPlate = new Map<string, number>();
    if (prevMatch && plates.length > 0) {
      const prevPipeline = [
        { $match: { ...prevMatch, license_plate: { $in: plates } } },
        { $group: { _id: '$license_plate', total: { $sum: '$amount' } } },
      ];
      const prevResults = await collection.aggregate(prevPipeline).toArray();
      prevTotalsByPlate = new Map(prevResults.map((r) => [r._id as string, r.total as number]));
    }

    return rows.map((r) => {
      const detail = detailMap.get(r.license_plate as string);
      const prevTotal = prevTotalsByPlate.get(r.license_plate as string);
      const momChangePercent =
        prevMatch && prevTotal !== undefined && prevTotal > 0
          ? Math.round(((r.totalAmount - prevTotal) / prevTotal) * 1000) / 10
          : null;

      return {
        license_plate: r.license_plate,
        totalAmount: r.totalAmount,
        expenseCount: r.expenseCount,
        topCategory: r.topCategory,
        average: r.expenseCount > 0 ? Math.round((r.totalAmount / r.expenseCount) * 100) / 100 : 0,
        min: detail ? Math.round(detail.min * 100) / 100 : 0,
        max: detail ? Math.round(detail.max * 100) / 100 : 0,
        latestDate: detail?.latestDate ? new Date(detail.latestDate).toISOString() : null,
        momChangePercent,
      };
    });
  }

  async getVehicleExpenseBreakdown(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    vehicleLimit: number = 8,
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<VehicleExpenseBreakdownRow[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange, scope, context);

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

  async getExpenseAmountDistribution(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<ExpenseAmountDistributionBucket[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange, scope, context);

    const count = await collection.countDocuments(match as Filter<Expense>);
    if (count === 0) return [];

    const bucketCount = Math.min(8, count);
    const pipeline = [
      { $match: match },
      { $bucketAuto: { groupBy: '$amount', buckets: bucketCount, output: { count: { $sum: 1 } } } },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({
      min: Math.round((r._id.min ?? 0) * 100) / 100,
      max: Math.round((r._id.max ?? 0) * 100) / 100,
      count: r.count,
    }));
  }

  async getJobTripExpenseAnalysis(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    jobLimit: number = 10,
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<JobTripExpenseRow[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange, scope, context);

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

  async getTopExpenseTransactions(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    limit: number = 10,
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<TopExpenseTransactionRow[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange, scope, context);

    const pipeline = [
      { $match: match },
      ...this.expenseTypeLookupStages(),
      { $sort: { amount: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: { $toString: '$_id' },
          license_plate: 1,
          category: { $ifNull: ['$expense_type.name', 'Uncategorized'] },
          amount: { $round: ['$amount', 2] },
          date: 1,
          jobTrip: { $ifNull: ['$jobTrip', null] },
          description: { $ifNull: ['$description', null] },
        },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({ ...r, date: new Date(r.date).toISOString() })) as TopExpenseTransactionRow[];
  }

  async getDailyExpenseTotals(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<DailyExpenseTotal[]> {
    const collection = await this.getCollection();
    const endDate = dateRange?.endDate ?? new Date();
    const requestedStart = dateRange?.startDate ?? new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);
    const earliestAllowedStart = new Date(endDate.getTime() - 366 * 24 * 60 * 60 * 1000);
    const startDate = requestedStart < earliestAllowedStart ? earliestAllowedStart : requestedStart;

    const match = this.buildBaseMatch(tenantId, { startDate, endDate }, scope, context);

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({
      date: r._id,
      amount: Math.round(r.amount * 100) / 100,
      count: r.count,
    }));
  }

  async getExpenseOutliers(
    tenantId: string,
    dateRange?: { startDate?: Date; endDate?: Date },
    zThreshold: number = 2.5,
    limit: number = 25,
    scope?: AnalyticsScope,
    context?: TenantContext
  ): Promise<ExpenseOutlierRow[]> {
    const collection = await this.getCollection();
    const match = this.buildBaseMatch(tenantId, dateRange, scope, context);

    const pipeline = [
      { $match: match },
      ...this.expenseTypeLookupStages(),
      {
        $group: {
          _id: { $ifNull: ['$expense_type.name', 'Uncategorized'] },
          mean: { $avg: '$amount' },
          stdDev: { $stdDevPop: '$amount' },
          docs: {
            $push: {
              _id: '$_id',
              license_plate: '$license_plate',
              amount: '$amount',
              date: '$date',
            },
          },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gte: 3 }, stdDev: { $gt: 0 } } },
      { $unwind: '$docs' },
      {
        $addFields: {
          zScore: { $divide: [{ $subtract: ['$docs.amount', '$mean'] }, '$stdDev'] },
        },
      },
      { $match: { $expr: { $gte: [{ $abs: '$zScore' }, zThreshold] } } },
      {
        $project: {
          _id: { $toString: '$docs._id' },
          license_plate: '$docs.license_plate',
          category: '$_id',
          amount: { $round: ['$docs.amount', 2] },
          date: '$docs.date',
          categoryMean: { $round: ['$mean', 2] },
          categoryStdDev: { $round: ['$stdDev', 2] },
          zScore: { $round: ['$zScore', 2] },
        },
      },
      { $sort: { zScore: -1 } },
      { $limit: limit },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({ ...r, date: new Date(r.date).toISOString() })) as ExpenseOutlierRow[];
  }
}

export const expenseRepository = new ExpenseRepository();