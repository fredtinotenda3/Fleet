// modules/security/repositories/resource-permission.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository } from '@/server/repositories/base.repository';
import { ResourcePermission, ResourcePermissionFilters } from '../types/resource-permission.types';

export class ResourcePermissionRepository extends BaseRepository<ResourcePermission> {
  protected collectionName = 'tblresourcepermissions';

  async findByFilters(filters: ResourcePermissionFilters): Promise<ResourcePermission[]> {
    const filter: Record<string, unknown> = { organizationId: filters.organizationId };
    if (filters.subjectType) filter.subjectType = filters.subjectType;
    if (filters.subjectId) filter.subjectId = filters.subjectId;
    if (filters.permission) filter.permission = filters.permission;
    if (filters.resourceType) filter.resourceType = filters.resourceType;
    if (filters.resourceId) filter.resourceId = filters.resourceId;
    if (filters.orgUnitId) filter.orgUnitId = filters.orgUnitId;
    if (filters.effect) filter.effect = filters.effect;

    return this.findMany(filter as Filter<ResourcePermission>, filters.organizationId, {
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  }

  /**
   * Fetches every grant potentially relevant to a single permission
   * check: matches on `permission` and any of the candidate subject ids
   * (the user, their static roles, their custom role ids), and includes
   * grants that are organization-wide for resource/org-unit scope as
   * well as grants scoped specifically to the resource/org-unit chain
   * being checked. Expired grants are excluded at the query level so the
   * caller never has to filter them out itself.
   */
  async findApplicableGrants(params: {
    organizationId: string;
    permission: string;
    subjectIds: string[];
    resourceType?: string;
    resourceId?: string;
    orgUnitPath?: string[];
  }): Promise<ResourcePermission[]> {
    const collection = await this.getCollection();
    const now = new Date();

    const resourceClauses: Record<string, unknown>[] = [{ resourceType: { $exists: false } }];
    if (params.resourceType) {
      resourceClauses.push({ resourceType: params.resourceType, resourceId: { $exists: false } });
      if (params.resourceId) {
        resourceClauses.push({ resourceType: params.resourceType, resourceId: params.resourceId });
      }
    }

    const orgUnitClauses: Record<string, unknown>[] = [{ orgUnitId: { $exists: false } }];
    if (params.orgUnitPath && params.orgUnitPath.length > 0) {
      orgUnitClauses.push({ orgUnitId: { $in: params.orgUnitPath } });
    }

    const filter = {
      ...this.getActiveFilter(params.organizationId),
      permission: params.permission,
      subjectId: { $in: params.subjectIds },
      $and: [
        { $or: resourceClauses },
        { $or: orgUnitClauses },
        { $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }] },
      ],
    } as unknown as Filter<ResourcePermission>;

    return collection.find(filter).toArray();
  }

  async revoke(id: string, tenantId: string, userId?: string): Promise<boolean> {
    return this.softDelete(id, tenantId, userId);
  }

  /**
   * Soft-deletes every grant whose `expiresAt` has passed. Intended to be
   * called by a scheduled job (see app/api/security/expire-grants) rather
   * than relying solely on the query-time expiry filter in
   * findApplicableGrants, so expired grants stop showing up in admin
   * listing UIs too, not just permission checks.
   */
  async expireStaleGrants(): Promise<number> {
    const collection = await this.getCollection();
    const result = await collection.updateMany(
      { expiresAt: { $ne: null, $lt: new Date() }, isDeleted: { $ne: true } } as Filter<ResourcePermission>,
      { $set: { isDeleted: true, deletedAt: new Date() } }
    );
    return result.modifiedCount;
  }
}

export const resourcePermissionRepository = new ResourcePermissionRepository();