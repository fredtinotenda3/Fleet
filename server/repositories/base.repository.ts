/* eslint-disable @typescript-eslint/no-unused-vars */
// server/repositories/base.repository.ts

import {
  Db,
  Collection,
  Document,
  ObjectId,
  Filter,
  FindOptions,
  UpdateFilter,
  MongoServerError,
} from 'mongodb';
import connectToDatabase from '@/infrastructure/database/mongodb';
import {
  BaseEntity,
  PaginationParams,
  PaginatedResponse,
} from '@/shared/types/common.types';
import {
  createPaginatedResponse,
  calculateSkip,
} from '@/shared/utils/pagination.utils';
import { ConflictError } from '@/server/errors/app.errors';

export interface QueryOptions extends FindOptions {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
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

  protected getTenantFilter(
    tenantId: string,
    isSuperAdmin: boolean = false
  ): Filter<T> {
    if (isSuperAdmin || tenantId === 'default' || tenantId === 'system') {
      return {} as Filter<T>;
    }
    return { tenantId } as Filter<T>;
  }

  protected getActiveFilter(
    tenantId: string,
    includeDeleted: boolean = false,
    isSuperAdmin: boolean = false
  ): Filter<T> {
    const filter = this.getTenantFilter(tenantId, isSuperAdmin);
    if (!includeDeleted) {
      return { ...filter, isDeleted: { $ne: true } } as Filter<T>;
    }
    return filter;
  }

  /**
   * Translates a MongoDB duplicate-key error (E11000) into a ConflictError
   * with a human-readable message, so callers (controllers) that only know
   * how to render AppError subclasses (see VehicleController.handleError)
   * get a proper 409 instead of a raw driver error falling through to a
   * generic 500.
   */
  private translateDuplicateKeyError(error: unknown): never {
    if (error instanceof MongoServerError && error.code === 11000) {
      const keyValue = (error.keyValue ?? {}) as Record<string, unknown>;
      const dupEntries = Object.entries(keyValue).filter(
        ([key]) => key !== 'tenantId'
      );
      const dupField = dupEntries.map(([key]) => key).join(', ') || 'field';
      const dupValue = dupEntries.map(([, value]) => value).join(', ');

      throw new ConflictError(
        dupValue
          ? `A record with this ${dupField} already exists (${dupValue}).`
          : `A record with this ${dupField} already exists.`,
        { keyValue }
      );
    }
    throw error;
  }

  async findById(
    id: string,
    tenantId: string,
    includeDeleted: boolean = false,
    isSuperAdmin: boolean = false
  ): Promise<T | null> {
    if (!ObjectId.isValid(id)) return null;
    const collection = await this.getCollection();
    const filter = {
      ...this.getActiveFilter(tenantId, includeDeleted, isSuperAdmin),
      _id: new ObjectId(id),
    } as Filter<T>;
    // `collection.findOne` returns `WithId<T> | null` (Mongo's own `_id:
    // ObjectId` clashes with our `_id?: string`); this repository's
    // public contract has always been `T`, so cast at the boundary.
    return collection.findOne(filter) as unknown as Promise<T | null>;
  }

  async findOne(
    filter: Filter<T>,
    tenantId: string,
    includeDeleted: boolean = false,
    isSuperAdmin: boolean = false
  ): Promise<T | null> {
    const collection = await this.getCollection();
    const finalFilter = {
      ...this.getActiveFilter(tenantId, includeDeleted, isSuperAdmin),
      ...filter,
    } as Filter<T>;
    return collection.findOne(finalFilter) as unknown as Promise<T | null>;
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

    const {
      sortBy = 'createdAt',
      sortOrder = 'desc',
      limit,
      ...findOptions
    } = options;
    const sort: Record<string, 1 | -1> = {
      [sortBy]: sortOrder === 'asc' ? 1 : -1,
    };

    let cursor = collection.find(finalFilter, findOptions).sort(sort);
    if (limit) cursor = cursor.limit(limit);
    return cursor.toArray() as unknown as Promise<T[]>;
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

    const {
      page,
      limit,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = pagination;
    const skip = calculateSkip(page, limit);
    const sort: Record<string, 1 | -1> = {
      [sortBy]: sortOrder === 'asc' ? 1 : -1,
    };

    const [data, total] = await Promise.all([
      collection
        .find(finalFilter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray(),
      collection.countDocuments(finalFilter),
    ]);

    return createPaginatedResponse(data as unknown as T[], total, { page, limit });
  }

  async create(
    data: Omit<T, '_id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt' | 'tenantId'>,
    tenantId: string,
    userId?: string
  ): Promise<T> {
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
    } as unknown as T;

    try {
      const result = await collection.insertOne(document as any);
      return { ...document, _id: result.insertedId.toString() };
    } catch (error) {
      // FIX: this was the direct cause of the POST /api/vehicles 500s —
      // re-creating a vehicle with a license_plate that still belonged to
      // an (already soft-deleted) record threw a raw MongoServerError
      // (E11000) that propagated straight out of this method. See
      // translateDuplicateKeyError() and the partial index fix in
      // infrastructure/database/indexes.ts.
      this.translateDuplicateKeyError(error);
    }
  }

  async update(
    id: string,
    data: Partial<Omit<T, '_id' | 'tenantId' | 'createdAt' | 'createdBy'>>,
    tenantId: string,
    userId?: string,
    isSuperAdmin: boolean = false
  ): Promise<T | null> {
    if (!ObjectId.isValid(id)) return null;
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
      } as any,
    };

    try {
      const result = await collection.findOneAndUpdate(filter, update, {
        returnDocument: 'after',
      });
      return (result ?? null) as unknown as T | null;
    } catch (error) {
      // Same rationale as create(): updating a record's unique field
      // (e.g. re-assigning a license_plate) to a value already in active
      // use should surface as a 409, not a raw driver error / 500.
      this.translateDuplicateKeyError(error);
    }
  }

  async softDelete(
    id: string,
    tenantId: string,
    userId?: string,
    isSuperAdmin: boolean = false
  ): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
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
        updatedAt: new Date(),
      } as any,
    };

    const result = await collection.updateOne(filter, update);
    return result.modifiedCount > 0;
  }

  async hardDelete(
    id: string,
    tenantId: string,
    isSuperAdmin: boolean = false
  ): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const collection = await this.getCollection();
    const filter = {
      ...this.getTenantFilter(tenantId, isSuperAdmin),
      _id: new ObjectId(id),
    } as Filter<T>;

    const result = await collection.deleteOne(filter);
    return result.deletedCount > 0;
  }

  async count(
    filter: Filter<T> = {},
    tenantId: string,
    includeDeleted: boolean = false,
    isSuperAdmin: boolean = false
  ): Promise<number> {
    const collection = await this.getCollection();
    const finalFilter = {
      ...this.getActiveFilter(tenantId, includeDeleted, isSuperAdmin),
      ...filter,
    } as Filter<T>;
    return collection.countDocuments(finalFilter);
  }

  async exists(
    filter: Filter<T>,
    tenantId: string,
    isSuperAdmin: boolean = false
  ): Promise<boolean> {
    const c = await this.count(filter, tenantId, false, isSuperAdmin);
    return c > 0;
  }
}