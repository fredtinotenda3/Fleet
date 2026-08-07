/* eslint-disable @typescript-eslint/no-unused-vars */
// modules/expenses/repositories/expense-type.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { ExpenseType } from '@/shared/types/expense.types';

export class ExpenseTypeRepository extends BaseRepository<ExpenseType> {
  protected collectionName = 'tblexpense_types';

  /**
   * THE "UNCATEGORISED" BUG.
   *
   * tblexpense_types is a SHARED REFERENCE CATALOGUE. Its documents
   * carry no `tenantId` at all -- they are seeded globally, exactly like
   * tblunits:
   *
   *   { _id, name: 'Airline Repair', category: 'repair', sortOrder: 2 }
   *
   * But this class extends BaseRepository, so every findMany/findOne ran
   * through getActiveFilter() and appended `{ tenantId: <slug> }`. No
   * document has that field, so the query matched NOTHING -- the
   * dropdown came back empty and every existing expense rendered as
   * "Uncategorised" because its type could not be resolved.
   *
   * Fixed with an explicit "mine or global" predicate rather than by
   * dropping the tenant filter outright. Tenants can add their own
   * expense types (the bulk-import handler does exactly that), and those
   * must stay private; the seeded catalogue is shared by everyone. A
   * global row is not another tenant's data, so including it is not a
   * leak -- but a row that DOES carry a tenantId is, and it stays
   * filtered.
   *
   * Expense types are organization-level reference data and are NOT
   * org-unit scoped: a branch manager must be able to categorise an
   * expense using the same catalogue as everyone else.
   */
  private sharedCatalogueFilter(tenantId: string): Record<string, unknown> {
    return {
      isDeleted: { $ne: true },
      $or: [
        { tenantId },
        { tenantId: { $exists: false } },
        { tenantId: null },
      ],
    };
  }

  /** Direct query bypassing BaseRepository's tenant-only filter. */
  private async queryCatalogue(
    tenantId: string,
    extra: Record<string, unknown> = {}
  ): Promise<ExpenseType[]> {
    const collection = await this.getCollection();
    return collection
      .find({ ...extra, ...this.sharedCatalogueFilter(tenantId) } as never)
      .sort({ sortOrder: 1, name: 1 })
      .toArray() as unknown as Promise<ExpenseType[]>;
  }

  async findByName(name: string, tenantId: string): Promise<ExpenseType | null> {
    const [hit] = await this.queryCatalogue(tenantId, {
      name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    });
    return hit ?? null;
  }

  async findByCategory(category: string, tenantId: string): Promise<ExpenseType[]> {
    return this.queryCatalogue(tenantId, { category });
  }

  async findActive(tenantId: string): Promise<ExpenseType[]> {
    return this.queryCatalogue(tenantId);
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