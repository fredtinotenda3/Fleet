// modules/workshop/repositories/workshop.repository.ts
import { Filter } from 'mongodb';
import { BaseRepository, isPlatformSentinelTenant } from '@/server/repositories/base.repository';
import { WorkshopBay, MechanicAssignment } from '../types/workshop.types';
import '../types/workshop.tenancy-addendum';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';

export class WorkshopBayRepository extends BaseRepository<WorkshopBay> {
  protected collectionName = 'tblworkshopbays';

  async getFiltered(status: string | undefined, tenantId: string, pagination: PaginationParams): Promise<PaginatedResponse<WorkshopBay>> {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    return this.findWithPagination(filter as Filter<WorkshopBay>, pagination, tenantId);
  }

  async findAvailable(tenantId: string): Promise<WorkshopBay[]> {
    return this.findMany({ status: 'available' } as Filter<WorkshopBay>, tenantId);
  }

  /**
   * Org-unit-scoped variant of getFiltered. A Workshop Manager (or any
   * role narrowed to a specific workshop via UserScopeAssignment) only
   * ever sees bays whose orgUnitId is in context.accessibleOrgUnitIds --
   * see TenantContextService.resolveContext() and
   * tenantScopeService.buildFilter(). Mirrors
   * VehicleRepository.getFilteredVehiclesInScope /
   * FuelRepository.getFilteredLogsInScope.
   */
  async getFilteredInScope(
    status: string | undefined,
    context: TenantContext,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<WorkshopBay>> {
    const collection = await this.getCollection();
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };

    if (!isPlatformSentinelTenant(context.organizationId)) {
      query.tenantId = context.organizationId;
    }
    if (status) query.status = status;

    const scopeFilter = tenantScopeService.buildFilter<WorkshopBay>(context, 'orgUnitId');
    Object.assign(query, scopeFilter);

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      collection.find(query as Filter<WorkshopBay>).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      collection.countDocuments(query as Filter<WorkshopBay>),
    ]);

    return {
      data: data as WorkshopBay[],
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

  /** Org-unit-scoped variant of findAvailable, for the Workshop Manager "assign a bay" picker. */
  async findAvailableInScope(context: TenantContext): Promise<WorkshopBay[]> {
    const collection = await this.getCollection();
    const query: Record<string, unknown> = {
      isDeleted: { $ne: true },
      status: 'available',
    };
    if (!isPlatformSentinelTenant(context.organizationId)) {
      query.tenantId = context.organizationId;
    }
    Object.assign(query, tenantScopeService.buildFilter<WorkshopBay>(context, 'orgUnitId'));
    return collection.find(query as Filter<WorkshopBay>).toArray() as Promise<WorkshopBay[]>;
  }
}

export class MechanicAssignmentRepository extends BaseRepository<MechanicAssignment> {
  protected collectionName = 'tblmechanicassignments';

  async findActiveForMechanic(mechanicId: string, tenantId: string): Promise<MechanicAssignment[]> {
    return this.findMany({ mechanicId, releasedAt: { $exists: false } } as Filter<MechanicAssignment>, tenantId);
  }

  /**
   * Org-unit-scoped variant of findActiveForMechanic. A Mechanic's own
   * active assignments are always visible to them (that's an ownership
   * check, not a scope check), but a Workshop Manager listing "everyone
   * currently assigned in my workshop" needs the org-unit filter --
   * this is that query.
   */
  async findActiveInScope(context: TenantContext): Promise<MechanicAssignment[]> {
    const collection = await this.getCollection();
    const query: Record<string, unknown> = {
      isDeleted: { $ne: true },
      releasedAt: { $exists: false },
    };
    if (!isPlatformSentinelTenant(context.organizationId)) {
      query.tenantId = context.organizationId;
    }
    Object.assign(query, tenantScopeService.buildFilter<MechanicAssignment>(context, 'orgUnitId'));
    return collection.find(query as Filter<MechanicAssignment>).toArray() as Promise<MechanicAssignment[]>;
  }
}

export const workshopBayRepository = new WorkshopBayRepository();
export const mechanicAssignmentRepository = new MechanicAssignmentRepository();