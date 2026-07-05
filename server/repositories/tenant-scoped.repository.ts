// server/repositories/tenant-scoped.repository.ts

import { Filter } from 'mongodb';
import { BaseRepository, QueryOptions } from './base.repository';
import { BaseEntity, PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';

/**
 * A tenant/org-unit-scoped variant of BaseEntity for domain records that
 * belong to a specific branch/department/team/fleet/workshop within an
 * organization, not just the organization as a whole (Phase 7).
 */
export interface OrgUnitScopedEntity extends BaseEntity {
  orgUnitId?: string;
}

/**
 * Extends BaseRepository with query helpers that additionally filter by
 * the caller's accessible org units (per Phase 7's TenantContext),
 * layered on top of BaseRepository's existing tenantId scoping. A
 * repository opts into this by extending TenantScopedRepository<T>
 * instead of BaseRepository<T> and having its collection's documents
 * carry an `orgUnitId` field.
 *
 * This is additive: repositories that don't need org-unit-level scoping
 * (e.g. organizations, audit log) are unaffected and continue extending
 * BaseRepository directly.
 */
export abstract class TenantScopedRepository<
  T extends OrgUnitScopedEntity
> extends BaseRepository<T> {
  async findManyInScope(
    filter: Filter<T>,
    context: TenantContext,
    options: QueryOptions = {}
  ): Promise<T[]> {
    const scopeFilter = tenantScopeService.buildFilter<T>(context, 'orgUnitId');
    return this.findMany({ ...filter, ...scopeFilter } as Filter<T>, context.organizationId, options);
  }

  async findWithPaginationInScope(
    filter: Filter<T>,
    pagination: PaginationParams,
    context: TenantContext
  ): Promise<PaginatedResponse<T>> {
    const scopeFilter = tenantScopeService.buildFilter<T>(context, 'orgUnitId');
    return this.findWithPagination(
      { ...filter, ...scopeFilter } as Filter<T>,
      pagination,
      context.organizationId
    );
  }
}