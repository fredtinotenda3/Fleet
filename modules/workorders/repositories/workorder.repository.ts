import { prefixMatch, containsMatch } from '@/shared/utils/regex.utils';
// modules/workorders/repositories/workorder.repository.ts
import { Filter } from 'mongodb';
import { BaseRepository, isPlatformSentinelTenant } from '@/server/repositories/base.repository';
import { WorkOrder, WorkOrderFilters } from '../types/workorder.types';
import '../types/workorder.tenancy-addendum';
import '../types/workorder.dvir-addendum';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';

export class WorkOrderRepository extends BaseRepository<WorkOrder> {
  protected collectionName = 'tblworkorders';

  async getFiltered(filters: WorkOrderFilters, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<WorkOrder>> {
    const filter: Record<string, unknown> = {};
    if (filters.license_plate) filter.license_plate = containsMatch(filters.license_plate);
    if (filters.status) filter.status = filters.status;
    if (filters.priority) filter.priority = filters.priority;
    if (filters.assignedMechanicId) filter.assignedMechanicId = filters.assignedMechanicId;
    return this.findWithPagination(filter as Filter<WorkOrder>, pagination, tenantId);
  }

  /**
   * Single source of truth for the tenant + org-unit-scope + filter
   * query shared by getFilteredInScope and getFilteredForExport, so the
   * two can never drift on what "matches the filters, in scope" means
   * -- mirrors FuelRepository.buildScopedQuery /
   * VehicleRepository.buildScopedQuery.
   */
  private buildScopedQuery(filters: WorkOrderFilters, context: TenantContext): Record<string, unknown> {
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };

    if (!isPlatformSentinelTenant(context.organizationId)) {
      query.tenantId = context.organizationId;
    }

    if (filters.license_plate) query.license_plate = containsMatch(filters.license_plate);
    if (filters.status) query.status = filters.status;
    if (filters.priority) query.priority = filters.priority;
    if (filters.assignedMechanicId) query.assignedMechanicId = filters.assignedMechanicId;

    const scopeFilter = tenantScopeService.buildFilter<WorkOrder>(context, 'orgUnitId');
    Object.assign(query, scopeFilter);

    return query;
  }

  /**
   * Org-unit-scoped variant of getFiltered. A Workshop Manager only sees
   * work orders whose orgUnitId is one of context.accessibleOrgUnitIds
   * (their assigned workshop and its descendants); org-wide roles
   * (SUPER_ADMIN/ORGANIZATION_OWNER/ORGANIZATION_ADMIN -- see
   * FULL_ORG_UNIT_VISIBILITY_ROLES) get accessibleOrgUnitIds === null,
   * which buildFilter() treats as "no narrowing".
   */
  async getFilteredInScope(
    filters: WorkOrderFilters,
    context: TenantContext,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<WorkOrder>> {
    const collection = await this.getCollection();
    const query = this.buildScopedQuery(filters, context);

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      collection.find(query as Filter<WorkOrder>).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      collection.countDocuments(query as Filter<WorkOrder>),
    ]);

    return {
      data: data as WorkOrder[],
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

  /** Export variant: same filters/scope, uncapped by UI pagination, capped at `cap` rows instead. */
  async getFilteredForExport(
    filters: WorkOrderFilters,
    context: TenantContext,
    cap: number = 50000
  ): Promise<{ rows: WorkOrder[]; totalMatched: number; truncated: boolean }> {
    const collection = await this.getCollection();
    const query = this.buildScopedQuery(filters, context);

    const [rows, totalMatched] = await Promise.all([
      collection.find(query as Filter<WorkOrder>).sort({ createdAt: -1 }).limit(cap).toArray(),
      collection.countDocuments(query as Filter<WorkOrder>),
    ]);

    return { rows: rows as WorkOrder[], totalMatched, truncated: totalMatched > cap };
  }

  /**
   * Org-unit-scoped count of open work orders, grouped by status. Backs
   * the Workshop Manager dashboard's workload widget -- same shape as
   * AnomalyRepository.countOpenBySeverity but scoped by org unit instead
   * of being tenant-wide.
   */
  async countByStatusInScope(context: TenantContext): Promise<Record<string, number>> {
    const collection = await this.getCollection();
    const query = this.buildScopedQuery({}, context);

    const results = await collection
      .aggregate([
        { $match: query },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .toArray();

    const counts: Record<string, number> = {};
    for (const r of results) counts[r._id as string] = r.count;
    return counts;
  }
}

export const workOrderRepository = new WorkOrderRepository();