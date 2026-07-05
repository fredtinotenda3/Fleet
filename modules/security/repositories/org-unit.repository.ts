// modules/security/repositories/org-unit.repository.ts

import { Filter, ObjectId } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { OrgUnit, OrgUnitFilters } from '../types/org-unit.types';

export class OrgUnitRepository extends BaseRepository<OrgUnit> {
  protected collectionName = 'tblorgunits';

  async findByOrganization(filters: OrgUnitFilters): Promise<OrgUnit[]> {
    const filter: Record<string, unknown> = { organizationId: filters.organizationId };
    if (filters.type) filter.type = filters.type;
    if (filters.parentId !== undefined) filter.parentId = filters.parentId;
    if (filters.status) filter.status = filters.status;

    return this.findMany(filter as Filter<OrgUnit>, filters.organizationId, {
      sortBy: 'name',
      sortOrder: 'asc',
    });
  }

  async findChildren(orgUnitId: string, tenantId: string): Promise<OrgUnit[]> {
    return this.findMany({ parentId: orgUnitId } as Filter<OrgUnit>, tenantId);
  }

  /**
   * Returns the ancestor chain (root-first, including this unit itself)
   * for a given org unit id, read directly off its stored materialized
   * `path` rather than walking parent pointers one query at a time. Any
   * ResourcePermission grant whose `orgUnitId` appears in this chain
   * cascades down to the requested unit.
   */
  async getPath(orgUnitId: string, tenantId: string): Promise<string[]> {
    const unit = await this.findById(orgUnitId, tenantId);
    if (!unit) return [];
    return [...unit.path, unit._id!];
  }

  async getDescendantIds(orgUnitId: string, tenantId: string): Promise<string[]> {
    const collection = await this.getCollection();
    const filter = {
      ...this.getActiveFilter(tenantId),
      path: orgUnitId,
    } as Filter<OrgUnit>;

    const descendants = await collection.find(filter).project({ _id: 1 }).toArray();
    return descendants.map((doc) => (doc._id as ObjectId).toString());
  }

  async countChildren(orgUnitId: string, tenantId: string): Promise<number> {
    return this.count({ parentId: orgUnitId } as Filter<OrgUnit>, tenantId);
  }
}

export const orgUnitRepository = new OrgUnitRepository();