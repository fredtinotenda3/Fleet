// modules/expenses/repositories/expense.repository.ts

import { Filter, ObjectId } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { Expense, ExpenseFilters, ExpenseStats } from '@/shared/types/expense.types';
import { PaginationParams, PaginatedResponse, DateRange } from '@/shared/types/common.types';

export class ExpenseRepository extends BaseRepository<Expense> {
  protected collectionName = 'tblexpenses';

  async findByLicensePlate(licensePlate: string, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<Expense>> {
    return this.findWithPagination({ license_plate: licensePlate.toUpperCase() }, pagination, tenantId);
  }

  async findByDateRange(dateRange: DateRange, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<Expense>> {
    return this.findWithPagination({
      date: { $gte: dateRange.startDate, $lte: dateRange.endDate },
    }, pagination, tenantId);
  }

  async getFilteredExpenses(filters: ExpenseFilters, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<Expense>> {
    const filter: Filter<Expense> = {};

    if (filters.license_plate) {
      filter.license_plate = { $regex: filters.license_plate, $options: 'i' };
    }
    if (filters.type) {
      filter.expense_type_id = new ObjectId(filters.type);
    }
    if (filters.startDate || filters.endDate) {
      filter.date = {};
      if (filters.startDate) filter.date.$gte = filters.startDate;
      if (filters.endDate) filter.date.$lte = filters.endDate;
    }
    if (filters.minAmount !== undefined) {
      filter.amount = { ...filter.amount, $gte: filters.minAmount };
    }
    if (filters.maxAmount !== undefined) {
      filter.amount = { ...filter.amount, $lte: filters.maxAmount };
    }

    return this.findWithPagination(filter, pagination, tenantId);
  }

  async getExpenseStats(tenantId: string, dateRange?: DateRange): Promise<ExpenseStats> {
    const collection = await this.getCollection();
    const filter = this.getActiveFilter(tenantId);
    
    if (dateRange) {
      filter.date = { $gte: dateRange.startDate, $lte: dateRange.endDate };
    }

    const pipeline = [
      { $match: filter },
      {
        $lookup: {
          from: 'tblexpense_types',
          localField: 'expense_type_id',
          foreignField: '_id',
          as: 'expense_type',
        },
      },
      { $unwind: { path: '$expense_type', preserveNullAndEmptyArrays: true } },
      {
        $facet: {
          total: [{ $group: { _id: null, total: { $sum: '$amount' } } }],
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
    const data = result[0] || { total: [], byType: [], byMonth: [], topCategories: [] };

    return {
      total: data.total[0]?.total || 0,
      average: data.total[0]?.total / (await collection.countDocuments(filter)) || 0,
      byType: Object.fromEntries(data.byType.map((t: any) => [t._id, t.total])),
      byMonth: Object.fromEntries(data.byMonth.map((m: any) => [m._id, m.total])),
      topCategories: data.topCategories.map((c: any) => ({ name: c._id, amount: c.total })),
    };
  }

  async getMonthlyTrends(tenantId: string, months: number = 12): Promise<Array<{ month: string; total: number }>> {
    const collection = await this.getCollection();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const pipeline = [
      { $match: { ...this.getActiveFilter(tenantId), date: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map(r => ({ month: r._id, total: r.total }));
  }

  async getExpenseAnalytics(tenantId: string, startDate: Date, endDate: Date): Promise<any[]> {
    const collection = await this.getCollection();
    
    const pipeline = [
      { $match: { ...this.getActiveFilter(tenantId), date: { $gte: startDate, $lte: endDate } } },
      {
        $lookup: {
          from: 'tblexpense_types',
          localField: 'expense_type_id',
          foreignField: '_id',
          as: 'expense_type',
        },
      },
      { $unwind: { path: '$expense_type', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { category: '$expense_type.name', month: { $dateToString: { format: '%Y-%m', date: '$date' } } },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.month': 1 } },
    ];

    return collection.aggregate(pipeline).toArray();
  }
}

export const expenseRepository = new ExpenseRepository();