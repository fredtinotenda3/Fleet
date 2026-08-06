// modules/dispatch/repositories/dispatch.repository.ts
import { Filter } from 'mongodb';
import { BaseRepository, isPlatformSentinelTenant } from '@/server/repositories/base.repository';
import { DispatchJob, DispatchFilters } from '../types/dispatch.types';
import '../types/dispatch.tenancy-addendum';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';

export class DispatchRepository extends BaseRepository<DispatchJob> {
  protected collectionName = 'tbldispatchjobs';

  async getFiltered(filters: DispatchFilters, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<DispatchJob>> {
    const filter: Record<string, unknown> = {};
    if (filters.status) filter.status = filters.status;
    if (filters.priority) filter.priority = filters.priority;
    if (filters.assignedDriverId) filter.assignedDriverId = filters.assignedDriverId;
    if (filters.assignedVehicleId) filter.assignedVehicleId = filters.assignedVehicleId;
    return this.findWithPagination(filter as Filter<DispatchJob>, pagination, tenantId);
  }

  async getActiveBoard(tenantId: string): Promise<DispatchJob[]> {
    return this.findMany({ status: { $in: ['unassigned', 'assigned', 'en_route', 'in_progress'] } } as Filter<DispatchJob>, tenantId, { sortBy: 'priority', sortOrder: 'asc' });
  }

  private buildScopedQuery(filters: DispatchFilters, context: TenantContext): Record<string, unknown> {
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };

    if (!isPlatformSentinelTenant(context.organizationId)) {
      query.tenantId = context.organizationId;
    }
    if (filters.status) query.status = filters.status;
    if (filters.priority) query.priority = filters.priority;
    if (filters.assignedDriverId) query.assignedDriverId = filters.assignedDriverId;
    if (filters.assignedVehicleId) query.assignedVehicleId = filters.assignedVehicleId;

    Object.assign(query, tenantScopeService.buildFilter<DispatchJob>(context, 'orgUnitId'));
    return query;
  }

  /** Org-unit-scoped variant of getFiltered -- Fleet Manager only sees dispatch jobs for their assigned fleet(s). */
  async getFilteredInScope(
    filters: DispatchFilters,
    context: TenantContext,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<DispatchJob>> {
    const collection = await this.getCollection();
    const query = this.buildScopedQuery(filters, context);

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      collection.find(query as Filter<DispatchJob>).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      collection.countDocuments(query as Filter<DispatchJob>),
    ]);

    return {
      data: data as DispatchJob[],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  /** Org-unit-scoped dispatch board -- the live "unassigned/assigned/en_route/in_progress" view a Fleet Manager works from. */
  async getActiveBoardInScope(context: TenantContext): Promise<DispatchJob[]> {
    const collection = await this.getCollection();
    const query: Record<string, unknown> = {
      isDeleted: { $ne: true },
      status: { $in: ['unassigned', 'assigned', 'en_route', 'in_progress'] },
    };
    if (!isPlatformSentinelTenant(context.organizationId)) {
      query.tenantId = context.organizationId;
    }
    Object.assign(query, tenantScopeService.buildFilter<DispatchJob>(context, 'orgUnitId'));
    return collection.find(query as Filter<DispatchJob>).sort({ priority: 1 }).toArray() as Promise<DispatchJob[]>;
  }
}

export const dispatchRepository = new DispatchRepository();