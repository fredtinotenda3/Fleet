// modules/drivers/repositories/driver.repository.ts

import { BaseRepository } from '@/server/repositories/base.repository';
import { Driver, DriverFilters } from '@/shared/types/driver.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { Filter, ObjectId } from 'mongodb';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class DriverRepository extends BaseRepository<Driver> {
  protected collectionName = 'tbldrivers';

  async getFilteredDrivers(
    filters: DriverFilters,
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Driver>> {
    const filter: Record<string, unknown> = {};

    if (filters.search) {
      filter.$or = [
        { name: { $regex: escapeRegex(filters.search), $options: 'i' } },
        { email: { $regex: escapeRegex(filters.search), $options: 'i' } },
        { driver_code: { $regex: escapeRegex(filters.search), $options: 'i' } },
      ];
    }
    if (filters.status) {
      filter.status = filters.status;
    }

    return this.findWithPagination(filter as Filter<Driver>, pagination, tenantId);
  }

  /**
   * All non-deleted drivers for a tenant, unpaginated, sorted by name.
   * Backs the controller's no-`page`-param fallback used by every picker
   * (FuelForm, FuelFilters, DriverSelect) -- mirrors
   * FuelStationRepository/FuelCardRepository, which return a bare array
   * the same way when no pagination is requested.
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
        tenantId,
        isDeleted: { $ne: true },
        status: 'active',
        $or: [
          { name: { $regex: `^${escapeRegex(trimmed)}$`, $options: 'i' } },
          { driver_code: { $regex: `^${escapeRegex(trimmed)}$`, $options: 'i' } },
        ],
      } as Filter<Driver>)
      .limit(2)
      .toArray();

    return matches.length === 1 ? (matches[0] as Driver) : null;
  }
}

export const driverRepository = new DriverRepository();