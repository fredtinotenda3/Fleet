// modules/drivers/repositories/driver.repository.ts

import { BaseRepository } from '@/server/repositories/base.repository';
import { Driver, DriverFilters } from '@/shared/types/driver.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { Filter, ObjectId } from 'mongodb';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * FIX (drivers never render in any "active" picker): real tbldrivers
 * documents in this tenant -- confirmed from a live document -- carry
 * no `status` field at all; only `name`, `driver_code`, `isDeleted`.
 * Any filter that does `{ status: 'active' }` as a strict equality
 * match therefore matches ZERO real drivers, silently. Every caller
 * that asks for active drivers (FuelForm, FuelFilters, DriverSelect,
 * the CSV-import name resolver below) hits this the same way.
 *
 * Rather than patch every frontend call site (fragile -- the next new
 * picker would reintroduce the same bug), this treats "active" at the
 * source as "explicitly active OR status field absent/null", since a
 * driver with no status recorded has never been marked inactive and
 * should behave like an active one until someone says otherwise.
 */
function buildStatusCondition(status: string): Record<string, unknown> {
  if (status === 'active') {
    return {
      $or: [{ status: 'active' }, { status: { $exists: false } }, { status: null }],
    };
  }
  return { status };
}

export class DriverRepository extends BaseRepository<Driver> {
  protected collectionName = 'tbldrivers';

  async getFilteredDrivers(
    filters: DriverFilters,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Driver>> {
    const conditions: Record<string, unknown>[] = [];

    if (filters.search) {
      conditions.push({
        $or: [
          { name: { $regex: escapeRegex(filters.search), $options: 'i' } },
          { email: { $regex: escapeRegex(filters.search), $options: 'i' } },
          { driver_code: { $regex: escapeRegex(filters.search), $options: 'i' } },
        ],
      });
    }
    if (filters.status) {
      conditions.push(buildStatusCondition(filters.status));
    }

    // Combine with $and rather than Object.assign so the search $or and
    // the status $or (both top-level `$or` keys) don't clobber each
    // other -- a plain `{...conditions[0], ...conditions[1]}` merge would
    // silently drop one of the two $or clauses since they share a key.
    const filter: Record<string, unknown> =
      conditions.length === 0
        ? {}
        : conditions.length === 1
        ? conditions[0]
        : { $and: conditions };

    return this.findWithPagination(filter as Filter<Driver>, pagination, tenantId);
  }

  /**
   * All non-deleted drivers for a tenant, unpaginated, sorted by name.
   * Backs the controller's no-`page`-param fallback used by every picker
   * (FuelForm, FuelFilters, DriverSelect) -- mirrors
   * FuelStationRepository/FuelCardRepository, which return a bare array
   * the same way when no pagination is requested. Deliberately does NOT
   * filter by status at all -- this is the "give me everyone" path.
   */
  async findAll(tenantId: string): Promise<Driver[]> {
    const collection = await this.getCollection();
    return collection
      .find({ tenantId, isDeleted: { $ne: true } } as Filter<Driver>)
      .sort({ name: 1 })
      .toArray() as Promise<Driver[]>;
  }

  /**
   * Resolves a free-text `driver` cell from the Fuel import CSV/Excel
   * (a full name, a driver_code, or a raw ObjectId string) to exactly one
   * active, non-deleted driver. Used by FuelController.importFuelLogs.
   *
   * Deliberately conservative: an ObjectId match short-circuits and
   * returns immediately (unambiguous by definition); a name/code match
   * only resolves if there is EXACTLY one hit. Two drivers sharing a
   * name is treated as "not found" rather than guessing, so the caller
   * surfaces a specific, correctable row-level import error instead of
   * silently assigning fuel to the wrong person.
   *
   * FIX: previously hard-coded `status: 'active'` as a strict match,
   * same bug as getFilteredDrivers above -- a real driver with no
   * `status` field could never be resolved during import. Now uses the
   * same buildStatusCondition('active') OR-missing rule.
   */
  async findByNameOrCode(query: string, tenantId: string): Promise<Driver | null> {
    const trimmed = query.trim();
    if (!trimmed) return null;
    const collection = await this.getCollection();

    if (ObjectId.isValid(trimmed)) {
      const byId = await collection.findOne({
        _id: new ObjectId(trimmed) as unknown as Driver['_id'],
        tenantId,
        isDeleted: { $ne: true },
      } as Filter<Driver>);
      if (byId) return byId as Driver;
    }

    const matches = await collection
      .find({
        $and: [
          {
            tenantId,
            isDeleted: { $ne: true },
            $or: [
              { name: { $regex: `^${escapeRegex(trimmed)}$`, $options: 'i' } },
              { driver_code: { $regex: `^${escapeRegex(trimmed)}$`, $options: 'i' } },
            ],
          },
          buildStatusCondition('active'),
        ],
      } as Filter<Driver>)
      .limit(2)
      .toArray();

    return matches.length === 1 ? (matches[0] as Driver) : null;
  }
}

export const driverRepository = new DriverRepository();