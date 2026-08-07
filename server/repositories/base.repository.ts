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
import {
  resolveTenantScope as resolveScope,
  assertUsableAsTenantId,
  PLATFORM_SCOPE_TENANT_ID as PLATFORM_SCOPE,
} from '@/server/tenancy/tenant-scope';

export interface QueryOptions extends FindOptions {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

/**
 * Tenant-scope sentinels now live in exactly one place:
 * server/tenancy/tenant-scope.ts. The PLATFORM_SENTINEL_TENANT_IDS /
 * isPlatformSentinelTenant exports that used to be defined here were a
 * FAIL-OPEN mechanism -- the literal strings 'default' | 'system' |
 * 'super_admin' silently disabled tenant filtering, and
 * lib/authOptions.ts handed 'default' to every legacy account that had
 * no tenantId. They are re-exported below so existing imports keep
 * compiling, but now delegate to the fail-CLOSED implementation: those
 * values raise TenantScopeError instead of granting global reads.
 */
export {
  PLATFORM_SCOPE_TENANT_ID,
  TenantScopeError,
  resolveTenantScope,
} from '@/server/tenancy/tenant-scope';

/**
 * @deprecated Import resolveTenantScope() from server/tenancy/tenant-scope
 * instead. Returns true ONLY for the single explicit platform sentinel,
 * never for the legacy fail-open values.
 */
export function isPlatformSentinelTenant(tenantId: string): boolean {
  return tenantId === PLATFORM_SCOPE;
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

  /**
   * FIX (critical -- fail-open tenant filter). This method used to be:
   *
   *   if (isSuperAdmin || isPlatformSentinelTenant(tenantId)) return {};
   *
   * Two independent ways to silently drop the tenant predicate:
   *
   *   a) `isSuperAdmin` was true for ORGANIZATION_OWNER as well as
   *      SUPER_ADMIN (see server/auth/auth-context.ts), because one
   *      boolean was doing two unrelated jobs -- "may bypass RBAC
   *      permission checks" and "may read across tenants". An org owner
   *      legitimately needs the first and must NEVER have the second.
   *   b) the literal strings 'default'/'system'/'super_admin' meant
   *      "return everything", and lib/authOptions.ts assigned 'default'
   *      to every account whose tbladmin record lacked a tenantId.
   *
   * Now: scope is resolved through the single fail-closed resolver.
   * A missing or legacy tenantId raises TenantScopeError (403) instead
   * of widening the query. `isPlatformAdmin` is a distinct parameter
   * that only a literal SUPER_ADMIN context ever sets to true.
   */
  protected getTenantFilter(
    tenantId: string,
    isPlatformAdmin: boolean = false
  ): Filter<T> {
    const scope = resolveScope(tenantId, { isPlatformAdmin });
    if (scope.kind === 'platform') {
      return {} as Filter<T>;
    }
    return { tenantId: scope.tenantId } as Filter<T>;
  }

  protected getActiveFilter(
    tenantId: string,
    includeDeleted: boolean = false,
    isPlatformAdmin: boolean = false
  ): Filter<T> {
    const filter = this.getTenantFilter(tenantId, isPlatformAdmin);
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


  /**
   * Normalizes a raw Mongo document so its runtime shape matches the
   * declared TypeScript type.
   *
   * THE PROBLEM THIS CLOSES
   * `BaseEntity._id` is declared `ID` (= string), but the driver returns
   * an `ObjectId`. Every read method papered over that with
   * `as unknown as Promise<T[]>` -- a cast that converts nothing, it
   * only silences the compiler. The type LIES: consumers write
   * `doc._id` believing it is a string, and it behaves like one right
   * up until it is compared or used in a query.
   *
   * Two real bugs came from exactly this:
   *
   *   1. TenantContextService.expandWithDescendants() collected
   *      `unit._id` into accessibleOrgUnitIds. Assignment roots were
   *      strings, descendants were ObjectIds, so
   *      `{ orgUnitId: { $in: [...] } }` matched only the root -- Mongo
   *      does not coerce ObjectId to string inside `$in`. Branch
   *      managers saw an empty application while every filter read as
   *      correct.
   *
   *   2. OrgUnitHierarchyService.moveUnit() queries `{ path: unit._id }`
   *      where `path` stores STRINGS. An ObjectId matches nothing, so
   *      descendant paths are never rewritten on a move -- silently.
   *
   * Neither is visible to `tsc`: the cast tells it the field is already
   * a string, so stricter compiler options would not have caught them.
   * The fix has to be where the lie is told.
   *
   * SCOPE AND SAFETY
   * Converts ONLY the top-level `_id`, and only when it is a real
   * ObjectId. It does not walk nested objects or arrays: reference
   * fields (vehicleId, orgUnitId, driver_id) are already stored as
   * strings here so there is nothing to fix, a deep walk would cost a
   * traversal on every read, and it would rewrite ObjectIds inside
   * caller payloads that may legitimately hold them.
   *
   * Documents obtained WITHOUT this repository -- `collection.find()`,
   * `collection.aggregate()`, and everything under `scripts/`, which
   * all use the raw driver -- still carry an ObjectId `_id`. That is
   * precisely why the ~25 `updateOne({ _id: doc._id })` write sites in
   * scripts/ keep working untouched: they never pass through here.
   * Code that mixes both sources must convert explicitly, which is what
   * `toObjectId()` is for.
   */
  protected normalizeDoc<R>(doc: unknown): R {
    if (!doc || typeof doc !== 'object') return doc as R;
    const raw = doc as Record<string, unknown>;
    const id = raw._id;
    if (id instanceof ObjectId) {
      return { ...raw, _id: id.toHexString() } as R;
    }
    return doc as R;
  }

  protected normalizeDocs<R>(docs: unknown[]): R[] {
    return docs.map((d) => this.normalizeDoc<R>(d));
  }

  /**
   * Converts a normalized (string) id back into an ObjectId for a query
   * filter. Use whenever a document that came out of THIS repository is
   * fed into a raw `collection.updateOne({ _id })` -- a bare string
   * matches nothing there and the write silently no-ops.
   */
  protected toObjectId(id: string | ObjectId): ObjectId {
    return id instanceof ObjectId ? id : new ObjectId(id);
  }

  async findById(
    id: string,
    tenantId: string,
    includeDeleted: boolean = false,
    isPlatformAdmin: boolean = false
  ): Promise<T | null> {
    if (!ObjectId.isValid(id)) return null;
    const collection = await this.getCollection();
    const filter = {
      ...this.getActiveFilter(tenantId, includeDeleted, isPlatformAdmin),
      _id: new ObjectId(id),
    } as Filter<T>;
    // `collection.findOne` returns `WithId<T> | null` (Mongo's own `_id:
    // ObjectId` clashes with our `_id?: string`); this repository's
    // public contract has always been `T`, so cast at the boundary.
    return this.normalizeDoc<T | null>(await collection.findOne(filter));
  }

  async findOne(
    filter: Filter<T>,
    tenantId: string,
    includeDeleted: boolean = false,
    isPlatformAdmin: boolean = false
  ): Promise<T | null> {
    const collection = await this.getCollection();
    const finalFilter = {
      ...filter,
      // Tenant scope is spread LAST and deliberately so: a caller-
      // supplied filter containing a `tenantId` (or `isDeleted`) key
      // must never be able to overwrite the scope predicate. Spreading
      // scope first -- as this did -- made every list/search/count
      // method silently bypassable by key collision.
      ...this.getActiveFilter(tenantId, includeDeleted, isPlatformAdmin),
    } as Filter<T>;
    return this.normalizeDoc<T | null>(await collection.findOne(finalFilter));
  }

  async findMany(
    filter: Filter<T> = {},
    tenantId: string,
    options: QueryOptions = {},
    includeDeleted: boolean = false,
    isPlatformAdmin: boolean = false
  ): Promise<T[]> {
    const collection = await this.getCollection();
    const finalFilter = {
      ...filter,
      // Tenant scope is spread LAST and deliberately so: a caller-
      // supplied filter containing a `tenantId` (or `isDeleted`) key
      // must never be able to overwrite the scope predicate. Spreading
      // scope first -- as this did -- made every list/search/count
      // method silently bypassable by key collision.
      ...this.getActiveFilter(tenantId, includeDeleted, isPlatformAdmin),
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
    return this.normalizeDocs<T>(await cursor.toArray());
  }

  async findWithPagination(
    filter: Filter<T> = {},
    pagination: PaginationParams,
    tenantId: string,
    includeDeleted: boolean = false,
    isPlatformAdmin: boolean = false
  ): Promise<PaginatedResponse<T>> {
    const collection = await this.getCollection();
    const finalFilter = {
      ...filter,
      // Tenant scope is spread LAST and deliberately so: a caller-
      // supplied filter containing a `tenantId` (or `isDeleted`) key
      // must never be able to overwrite the scope predicate. Spreading
      // scope first -- as this did -- made every list/search/count
      // method silently bypassable by key collision.
      ...this.getActiveFilter(tenantId, includeDeleted, isPlatformAdmin),
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

    return createPaginatedResponse(this.normalizeDocs<T>(data), total, { page, limit });
  }

  async create(
    data: Omit<T, '_id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt' | 'tenantId'>,
    tenantId: string,
    userId?: string
  ): Promise<T> {
    const collection = await this.getCollection();
    const now = new Date();

    /**
     * FIX (critical -- write-side tenant corruption). This is the exact
     * line that produced the reported symptom. Import routes resolve the
     * tenant via getTenantFromRequest(), which returned the literal
     * 'default' for any caller whose account had no tenantId. That value
     * was then written straight onto every created row, so imported
     * vehicles ended up carrying tenantId: 'default' -- invisible to
     * their real organization's scoped queries, and visible to every
     * caller whose scope was also 'default'.
     *
     * assertUsableAsTenantId() refuses to persist a platform sentinel or
     * a legacy value. A misconfigured import now fails loudly at row 1
     * instead of silently poisoning the collection.
     */
    const ownerTenantId = assertUsableAsTenantId(tenantId);

    const document = {
      ...data,
      tenantId: ownerTenantId,
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
      // FIX: this was the direct cause of the POST /api/vehicles 500s â€”
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
    isPlatformAdmin: boolean = false
  ): Promise<T | null> {
    if (!ObjectId.isValid(id)) return null;
    const collection = await this.getCollection();
    const filter = {
      ...this.getTenantFilter(tenantId, isPlatformAdmin),
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
      return this.normalizeDoc<T | null>(result ?? null);
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
    isPlatformAdmin: boolean = false
  ): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const collection = await this.getCollection();
    const filter = {
      ...this.getTenantFilter(tenantId, isPlatformAdmin),
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
    isPlatformAdmin: boolean = false
  ): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const collection = await this.getCollection();
    const filter = {
      ...this.getTenantFilter(tenantId, isPlatformAdmin),
      _id: new ObjectId(id),
    } as Filter<T>;

    const result = await collection.deleteOne(filter);
    return result.deletedCount > 0;
  }

  async count(
    filter: Filter<T> = {},
    tenantId: string,
    includeDeleted: boolean = false,
    isPlatformAdmin: boolean = false
  ): Promise<number> {
    const collection = await this.getCollection();
    const finalFilter = {
      ...filter,
      // Tenant scope is spread LAST and deliberately so: a caller-
      // supplied filter containing a `tenantId` (or `isDeleted`) key
      // must never be able to overwrite the scope predicate. Spreading
      // scope first -- as this did -- made every list/search/count
      // method silently bypassable by key collision.
      ...this.getActiveFilter(tenantId, includeDeleted, isPlatformAdmin),
    } as Filter<T>;
    return collection.countDocuments(finalFilter);
  }

  async exists(
    filter: Filter<T>,
    tenantId: string,
    isPlatformAdmin: boolean = false
  ): Promise<boolean> {
    const c = await this.count(filter, tenantId, false, isPlatformAdmin);
    return c > 0;
  }
}