// C:\Users\user\Desktop\Fleet\server\repositories\base.repository.ts

import { Db, Collection, Document, ObjectId, Filter, FindOptions, UpdateFilter } from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';
import { BaseEntity, PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { createPaginatedResponse, calculateSkip } from '@/shared/utils/pagination.utils';

export interface QueryOptions extends FindOptions {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface SoftDeleteOptions {
  softDelete?: boolean;
  deletedBy?: string;
}

export abstract class BaseRepository<T extends BaseEntity> {
  protected abstract collectionName: string;
  protected db: Db | null = null;

  protected async getCollection(): Promise<Collection<T>> {
    if (!this.db) {
      this.db = await connectToDatabase();
    }
    return this.db.collection<T>(this.collectionName);
  }

  protected getTenantFilter(tenantId: string, isSuperAdmin: boolean = false): Filter<T> {
    // Super admin sees all tenants, regular users only see their tenant
    if (isSuperAdmin) {
      return {} as Filter<T>;
    }
    return { tenantId } as Filter<T>;
  }

  protected getActiveFilter(tenantId: string, includeDeleted: boolean = false, isSuperAdmin: boolean = false): Filter<T> {
    const filter = this.getTenantFilter(tenantId, isSuperAdmin);
    if (!includeDeleted) {
      return { ...filter, isDeleted: { $ne: true } } as Filter<T>;
    }
    return filter;
  }

  async findById(id: string, tenantId: string, includeDeleted: boolean = false, isSuperAdmin: boolean = false): Promise<T | null> {
    const collection = await this.getCollection();
    const filter = {
      ...this.getActiveFilter(tenantId, includeDeleted, isSuperAdmin),
      _id: new ObjectId(id),
    } as Filter<T>;
    return collection.findOne(filter);
  }

  async findOne(filter: Filter<T>, tenantId: string, includeDeleted: boolean = false, isSuperAdmin: boolean = false): Promise<T | null> {
    const collection = await this.getCollection();
    const finalFilter = {
      ...this.getActiveFilter(tenantId, includeDeleted, isSuperAdmin),
      ...filter,
    } as Filter<T>;
    return collection.findOne(finalFilter);
  }

  async findMany(
    filter: Filter<T> = {},
    tenantId: string,
    options: QueryOptions = {},
    includeDeleted: boolean = false,
    isSuperAdmin: boolean = false
  ): Promise<T[]> {
    const collection = await this.getCollection();
    const finalFilter = {
      ...this.getActiveFilter(tenantId, includeDeleted, isSuperAdmin),
      ...filter,
    } as Filter<T>;

    const { sortBy = 'createdAt', sortOrder = 'desc', ...findOptions } = options;
    const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    return collection.find(finalFilter, findOptions).sort(sort).toArray();
  }

  async findWithPagination(
    filter: Filter<T> = {},
    pagination: PaginationParams,
    tenantId: string,
    includeDeleted: boolean = false,
    isSuperAdmin: boolean = false
  ): Promise<PaginatedResponse<T>> {
    const collection = await this.getCollection();
    const finalFilter = {
      ...this.getActiveFilter(tenantId, includeDeleted, isSuperAdmin),
      ...filter,
    } as Filter<T>;

    const { page, limit, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
    const skip = calculateSkip(page, limit);
    const sort: Record<string, 1 | -1> = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [data, total] = await Promise.all([
      collection.find(finalFilter).sort(sort).skip(skip).limit(limit).toArray(),
      collection.countDocuments(finalFilter),
    ]);

    return createPaginatedResponse(data, total, { page, limit });
  }

  async create(data: Omit<T, '_id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt'>, tenantId: string, userId?: string): Promise<T> {
    const collection = await this.getCollection();
    const now = new Date();
    
    const document = {
      ...data,
      tenantId,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      deletedAt: null,
      createdBy: userId,
      updatedBy: userId,
    } as T;

    const result = await collection.insertOne(document);
    return { ...document, _id: result.insertedId.toString() };
  }

  async update(
    id: string,
    data: Partial<Omit<T, '_id' | 'tenantId' | 'createdAt' | 'createdBy'>>,
    tenantId: string,
    userId?: string,
    isSuperAdmin: boolean = false
  ): Promise<T | null> {
    const collection = await this.getCollection();
    const filter = {
      ...this.getTenantFilter(tenantId, isSuperAdmin),
      _id: new ObjectId(id),
      isDeleted: { $ne: true },
    } as Filter<T>;

    const update: UpdateFilter<T> = {
      $set: {
        ...data,
        updatedAt: new Date(),
        updatedBy: userId,
      },
    };

    const result = await collection.findOneAndUpdate(filter, update, { returnDocument: 'after' });
    return result;
  }

  async softDelete(id: string, tenantId: string, userId?: string, isSuperAdmin: boolean = false): Promise<boolean> {
    const collection = await this.getCollection();
    const filter = {
      ...this.getTenantFilter(tenantId, isSuperAdmin),
      _id: new ObjectId(id),
      isDeleted: { $ne: true },
    } as Filter<T>;

    const update: UpdateFilter<T> = {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        updatedBy: userId,
      },
    };

    const result = await collection.updateOne(filter, update);
    return result.modifiedCount > 0;
  }

  async hardDelete(id: string, tenantId: string, isSuperAdmin: boolean = false): Promise<boolean> {
    const collection = await this.getCollection();
    const filter = {
      ...this.getTenantFilter(tenantId, isSuperAdmin),
      _id: new ObjectId(id),
    } as Filter<T>;

    const result = await collection.deleteOne(filter);
    return result.deletedCount > 0;
  }

  async count(filter: Filter<T> = {}, tenantId: string, includeDeleted: boolean = false, isSuperAdmin: boolean = false): Promise<number> {
    const collection = await this.getCollection();
    const finalFilter = {
      ...this.getActiveFilter(tenantId, includeDeleted, isSuperAdmin),
      ...filter,
    } as Filter<T>;
    return collection.countDocuments(finalFilter);
  }

  async exists(filter: Filter<T>, tenantId: string, isSuperAdmin: boolean = false): Promise<boolean> {
    const count = await this.count(filter, tenantId, false, isSuperAdmin);
    return count > 0;
  }

  async bulkWrite(operations: Array<{ type: 'insert' | 'update' | 'delete'; document: any }>, tenantId: string): Promise<void> {
    const collection = await this.getCollection();
    const bulkOps = operations.map(op => {
      switch (op.type) {
        case 'insert':
          return { insertOne: { document: { ...op.document, tenantId } } };
        case 'update':
          return { updateOne: { filter: { ...this.getTenantFilter(tenantId), _id: op.document._id }, update: { $set: op.document } } };
        case 'delete':
          return { deleteOne: { filter: { ...this.getTenantFilter(tenantId), _id: op.document._id } } };
        default:
          throw new Error(`Unknown operation type: ${op.type}`);
      }
    });
    await collection.bulkWrite(bulkOps);
  }
}