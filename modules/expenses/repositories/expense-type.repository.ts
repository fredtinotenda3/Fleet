/* eslint-disable @typescript-eslint/no-unused-vars */
// modules/expenses/repositories/expense-type.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { ExpenseType } from '@/shared/types/expense.types';

export class ExpenseTypeRepository extends BaseRepository<ExpenseType> {
  protected collectionName = 'tblexpense_types';

  async findByName(name: string, tenantId: string): Promise<ExpenseType | null> {
    return this.findOne(
      { name: { $regex: `^${name}$`, $options: 'i' } } as Filter<ExpenseType>,
      tenantId
    );
  }

  async findByCategory(category: string, tenantId: string): Promise<ExpenseType[]> {
    return this.findMany(
      { category } as Filter<ExpenseType>,
      tenantId
    );
  }

  async findActive(tenantId: string): Promise<ExpenseType[]> {
    return this.findMany(
      { isDeleted: { $ne: true } } as Filter<ExpenseType>,
      tenantId,
      { sortBy: 'name', sortOrder: 'asc' }
    );
  }

  async findWithCategory(tenantId: string): Promise<Array<{ category: string; types: ExpenseType[] }>> {
    const types = await this.findActive(tenantId);
    const grouped = types.reduce((acc, type) => {
      const category = type.category || 'All';
      if (!acc[category]) acc[category] = [];
      acc[category].push(type);
      return acc;
    }, {} as Record<string, ExpenseType[]>);

    return Object.entries(grouped).map(([category, types]) => ({ category, types }));
  }

  async softDeleteByName(name: string, tenantId: string): Promise<boolean> {
    const type = await this.findByName(name, tenantId);
    if (!type || !type._id) return false;
    return this.softDelete(type._id, tenantId);
  }

  async getCategoryStats(tenantId: string): Promise<Array<{ category: string; count: number; totalAmount: number }>> {
    const collection = await this.getCollection();
    const db = await (await import('@/infrastructure/database/mongodb')).default();
    const expensesCollection = db.collection('tblexpenses');

    const pipeline = [
      {
        $lookup: {
          from: 'tblexpenses',
          localField: '_id',
          foreignField: 'expense_type_id',
          as: 'expenses',
        },
      },
      {
        $project: {
          category: 1,
          expenseCount: { $size: '$expenses' },
          totalAmount: { $sum: '$expenses.amount' },
        },
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: '$expenseCount' },
          totalAmount: { $sum: '$totalAmount' },
        },
      },
      {
        $sort: { totalAmount: -1 },
      },
    ];

    const results = await collection.aggregate(pipeline).toArray();
    return results.map((r) => ({
      category: r._id || 'All',
      count: r.count,
      totalAmount: r.totalAmount,
    }));
  }
}

export const expenseTypeRepository = new ExpenseTypeRepository();