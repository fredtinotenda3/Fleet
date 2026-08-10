// modules/dvir/repositories/dvir.repository.ts

import { Filter } from 'mongodb';
import { TenantScopedRepository } from '@/server/repositories/tenant-scoped.repository';
import { isPlatformSentinelTenant } from '@/server/repositories/base.repository';
import { DVIRInspection, DVIRFilters } from '../types/dvir.types';
import { PaginationParams, PaginatedResponse } from '@/shared/types/common.types';
import { TenantContext } from '@/modules/tenancy/services/tenant-context.service';
import { tenantScopeService } from '@/modules/tenancy/services/tenant-scope.service';

export class DVIRRepository extends TenantScopedRepository<DVIRInspection> {
  protected collectionName = 'tbldvirinspections';

  /**
   * Single source of truth for the tenant + org-unit-scope + filter
   * query, mirroring WorkOrderRepository.buildScopedQuery /
   * VehicleRepository.buildScopedQuery so getFilteredInScope can't
   * drift from any future export/analytics variant.
   */
  private buildScopedQuery(filters: DVIRFilters, context: TenantContext): Record<string, unknown> {
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };

    if (!isPlatformSentinelTenant(context.organizationId)) {
      query.tenantId = context.organizationId;
    }

    if (filters.license_plate) query.license_plate = filters.license_plate.toUpperCase();
    if (filters.driverId) query.driverId = filters.driverId;
    if (filters.type) query.type = filters.type;
    if (filters.overallStatus) query.overallStatus = filters.overallStatus;
    if (typeof filters.outOfService === 'boolean') query.outOfService = filters.outOfService;

    const scopeFilter = tenantScopeService.buildFilter<DVIRInspection>(context, 'orgUnitId');
    Object.assign(query, scopeFilter);

    return query;
  }

  /**
   * Org-unit-scoped, paginated list. A driver or workshop manager only
   * sees inspections for vehicles inside their accessible org units
   * (their own branch/fleet and its descendants); org-wide roles get
   * accessibleOrgUnitIds === null, which buildFilter() treats as "no
   * narrowing" -- see TenantScopedRepository.
   */
  async getFilteredInScope(
    filters: DVIRFilters,
    context: TenantContext,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<DVIRInspection>> {
    const collection = await this.getCollection();
    const query = this.buildScopedQuery(filters, context);

    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      collection.find(query as Filter<DVIRInspection>).sort({ submittedAt: -1 }).skip(skip).limit(limit).toArray(),
      collection.countDocuments(query as Filter<DVIRInspection>),
    ]);

    return {
      data: data as DVIRInspection[],
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

  /**
   * Idempotency lookup for offline-queue resubmission: the PWA mints
   * clientInspectionId on-device and retries the same payload until it
   * gets a 2xx. Without this, a retry after a response was lost in
   * transit (not uncommon on the flaky connectivity this feature exists
   * for) would create a duplicate inspection AND a duplicate work order
   * per defect. Scoped to {tenantId, driverId} rather than tenant-wide
   * because the id is only guaranteed unique per device/driver session.
   */
  async findByClientInspectionId(
    tenantId: string,
    driverId: string,
    clientInspectionId: string
  ): Promise<DVIRInspection | null> {
    return this.findOne(
      { driverId, clientInspectionId } as Filter<DVIRInspection>,
      tenantId
    );
  }

  /** Appends a newly-created work order id to the inspection's workOrderIds array. */
  async appendWorkOrderId(id: string, workOrderId: string, tenantId: string): Promise<void> {
    const collection = await this.getCollection();
    const { ObjectId } = await import('mongodb');
    if (!ObjectId.isValid(id)) return;
    await collection.updateOne(
      { _id: new ObjectId(id) } as unknown as Filter<DVIRInspection>,
      { $push: { workOrderIds: workOrderId } } as any
    );
  }
}

export const dvirRepository = new DVIRRepository();
